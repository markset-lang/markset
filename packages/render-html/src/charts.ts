/**
 * Drawing charts (spec §11).
 *
 * Like `diagrams.ts`, this runs over the hast tree after mdast-util-to-hast, so
 * the mdast the caller handed us is never touched and obligation 3 ("drawing
 * MUST NOT change the AST") holds by construction rather than by promise.
 *
 * Two things differ from the diagram pass, and both come from §11.
 *
 * **The chart is added, never substituted.** Obligation 8: a drawn chart must
 * not make its table unreachable. A diagram's fallback is lossy by nature, so
 * replacing it costs a reader nothing they could otherwise have had; a chart's
 * picture is a lossy view of data that is sitting right there, and in a
 * document where the numbers are the argument, the reader who wants an exact
 * value is not an edge case. So the SVG goes in front of the table and the
 * table stays.
 *
 * **The SVG is inline, not an <img>.** §10 refused inline markup because a
 * diagram engine on the CLI path is an arbitrary command, and raw markup from
 * one is a channel documents are denied (§4). The built-in chart engine is not
 * that: it is our own pure function and it returns constructed nodes, so there
 * is no markup to parse and no channel to open. Obligation 6 holds because the
 * tree is built rather than injected — a test asserts nothing script-bearing
 * reaches it — and inline is what lets a theme color a chart with ordinary CSS.
 */
import type { Element, ElementContent, Nodes as HastNodes, Parent } from "hast";
import { chart, type ChartData, type ChartElement, type ChartType } from "@markset-lang/chart-table";

/**
 * Draws one chart. Receives the type the author asked for and the table read
 * off the figure, and returns a tree, or null when it declines to draw.
 *
 * Throwing is a supported outcome: obligation 5 says a failed chart falls back
 * to the table and never removes content.
 */
export type ChartEngine = (type: ChartType, data: ChartData) => ChartElement | null;

export interface ChartOptions {
  /** The engine to draw with. Defaults to the built-in one. */
  engine?: ChartEngine;
  /** Called when the engine throws (§11 obligation 5). */
  onError?: (error: Error, type: ChartType) => void;
}

export const builtInChartEngine: ChartEngine = chart;

/**
 * Resolve the `charts` render option.
 *
 * `undefined` means draw with the built-in engine. Unlike diagrams, where the
 * info string may simply be naming a language, `chart=` is the author asking
 * for a picture in so many words, so on is the right default. `false` turns
 * drawing off, which is what the conformance harness passes: the `html` aspect
 * has to be a form a second implementation could also produce, and a drawn
 * chart is this implementation's own SVG.
 */
export function resolveChartEngine(option: ChartOptions | false | undefined): ChartOptions | null {
  if (option === false) return null;
  return { engine: option?.engine ?? builtInChartEngine, onError: option?.onError };
}

export function drawCharts(tree: HastNodes, options: ChartOptions): void {
  visit(tree, options);
}

/**
 * The figure handler sets the property under its literal HTML name, and
 * mdast-util-to-hast would use hast's camelCase one. Both are read, because
 * which of them a tree carries depends on how it was built, and a chart that
 * silently did not draw is the hardest kind of failure to notice.
 */
function chartTypeOf(node: Element): ChartType | null {
  const value = node.properties["data-chart"] ?? node.properties.dataChart;
  return typeof value === "string" && value !== "" ? (value as ChartType) : null;
}

function visit(node: HastNodes, options: ChartOptions): void {
  if (node.type === "element" && node.tagName === "figure" && chartTypeOf(node)) {
    drawInFigure(node, options.engine ?? builtInChartEngine, options.onError);
  }
  if ("children" in node) for (const child of node.children) visit(child, options);
}

/**
 * A chart is only drawn for a captioned figure (§11 obligation 7).
 *
 * The caption is what says what the picture shows, and a drawn chart without
 * one claims more than it can support. When the figure's content is a table the
 * caption is the table's own `<caption>` (§4.8), so that is where to look.
 */
function drawInFigure(figure: Element, engine: ChartEngine, onError: ChartOptions["onError"]): void {
  const type = chartTypeOf(figure);
  if (!type) return;
  const index = figure.children.findIndex((c) => c.type === "element" && c.tagName === "table");
  if (index < 0) return;
  const table = figure.children[index] as Element;
  if (!hasCaption(table)) return;

  const data = read(table);
  if (!data) return;

  let drawn: ChartElement | null;
  try {
    drawn = engine(type, data);
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)), type);
    return;
  }
  if (!drawn) return;
  // In front of the table, not instead of it (obligation 8).
  figure.children.splice(index, 0, drawn as unknown as ElementContent, { type: "text", value: "\n" });
}

function hasCaption(table: Element): boolean {
  return table.children.some((c) => c.type === "element" && c.tagName === "caption" && textOf(c).trim() !== "");
}

/**
 * Read a rendered table into series, which is §11's normative mapping: the
 * first column is the category axis, every other column is one series named by
 * its header, and a cell that is not a number is a missing point rather than a
 * zero.
 *
 * Done on the hast rather than the mdast so that whatever the renderer did to
 * the table — and it moves the caption inside it — the chart is read off the
 * same thing the reader sees.
 */
function read(table: Element): ChartData | null {
  const rows = collect(table, "tr");
  if (rows.length < 2) return null;
  const header = collect(rows[0], "th").concat(collect(rows[0], "td"));
  if (header.length < 2) return null;

  const categoryLabel = textOf(header[0]).trim();
  const names = header.slice(1).map((h) => textOf(h).trim());
  const categories: string[] = [];
  const series: ChartData["series"] = names.map((name) => ({ name, values: [] }));

  for (const row of rows.slice(1)) {
    const cells = collect(row, "td");
    if (!cells.length) continue;
    categories.push(textOf(cells[0]).trim());
    names.forEach((_, i) => {
      series[i].values.push(number(cells[i + 1] ? textOf(cells[i + 1]) : ""));
    });
  }
  return categories.length ? { categoryLabel, categories, series } : null;
}

/**
 * A cell's number, or null when it does not hold one.
 *
 * Thousands separators and a trailing or leading unit are stripped, because a
 * document written for people writes "1,200" and "$4.10" and "26%" — and a
 * chart that silently dropped those rows would be drawing a different argument
 * from the one on the page. Anything still ambiguous is a gap, not a guess.
 */
function number(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  const match = /^[^\d\-+.]*(-?\+?\d*\.?\d+)[^\d]*$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function collect(node: Element, tagName: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Element | Parent) => {
    for (const child of n.children) {
      if (child.type !== "element") continue;
      if (child.tagName === tagName) out.push(child);
      else walk(child);
    }
  };
  walk(node);
  return out;
}

function textOf(node: HastNodes): string {
  if (node.type === "text") return node.value;
  if (!("children" in node)) return "";
  return node.children.map(textOf).join("");
}
