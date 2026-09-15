/**
 * Drawing diagrams (spec §10).
 *
 * A diagram is not a construct: it is a fenced code block whose info string
 * names a diagram language. This module is the optional step that replaces such
 * a code block with a drawn form in HTML output. It runs over the hast tree,
 * after mdast-util-to-hast, so the mdast the caller handed us is never touched
 * and obligation 3 ("drawing MUST NOT change the AST") holds by construction
 * rather than by promise.
 */
import type { Element, Nodes as HastNodes, Parent } from "hast";

/**
 * Draws one diagram. Receives the fence's source and its info string, returns
 * SVG markup, or null when it declines to draw this one.
 *
 * Throwing is a supported outcome: §10 obligation 5 says a failed diagram falls
 * back to the code block and never removes content, so a drawer that cannot
 * cope with its input should say so rather than return something broken.
 */
export type DiagramDrawer = (source: string, language: string) => string | null;

export interface DiagramOptions {
  /** Drawers by info string. A language with no drawer is left as a code block. */
  drawers: Record<string, DiagramDrawer>;
  /** Called when a drawer throws or returns something that is not SVG (§10 obligation 5). */
  onError?: (error: Error, language: string) => void;
}

/**
 * Replace drawable diagram fences with an <img> carrying an SVG data URI.
 *
 * Why a data URI and not inline SVG: §4 says raw HTML in the source is never
 * passed through, and a drawer — which on the CLI path is an arbitrary command
 * the operator named — should not be handed a channel that documents are
 * denied. An SVG loaded through <img> cannot execute script, so §10 obligation
 * 6 is satisfied by the shape of the output instead of by trusting the drawer.
 */
export function drawDiagrams(tree: HastNodes, options: DiagramOptions): void {
  if (Object.keys(options.drawers).length === 0) return;
  visit(tree, options);
}

function visit(node: HastNodes, options: DiagramOptions): void {
  if (node.type === "element" && hasClass(node, "ms-figure")) drawInFigure(node, options);
  if ("children" in node) for (const child of node.children) visit(child, options);
}

/**
 * A diagram is only ever drawn inside a captioned figure (§10 obligation 7).
 *
 * The caption is the text alternative, and without one, drawing would take
 * content away from a reader using a screen reader while adding it for
 * everyone else. There is nowhere else in the grammar for a fence to carry a
 * caption, so "captioned figure" and "drawable" are the same condition.
 */
function drawInFigure(figure: Element, options: DiagramOptions): void {
  const caption = figure.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "figcaption",
  );
  const alt = caption ? textOf(caption).trim() : "";
  if (alt === "") return;

  for (const [index, child] of figure.children.entries()) {
    if (child.type !== "element" || child.tagName !== "pre") continue;
    const code = child.children.find((n): n is Element => n.type === "element" && n.tagName === "code");
    if (!code) continue;
    const language = languageOf(code);
    const drawer = language ? options.drawers[language] : undefined;
    if (!language || !drawer) continue;

    const svg = draw(drawer, textOf(code), language, options.onError);
    if (svg === null) continue;
    figure.children[index] = image(svg, language, alt);
  }
}

function draw(
  drawer: DiagramDrawer,
  source: string,
  language: string,
  onError: DiagramOptions["onError"],
): string | null {
  let svg: string | null;
  try {
    svg = drawer(source, language);
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)), language);
    return null;
  }
  if (svg === null || svg === "") return null;
  // A drawer on the CLI path is a command the operator named, so its stdout can
  // be anything at all — a usage message, a stack trace, an empty file. Check
  // that it is at least SVG before embedding it, so a misconfigured command
  // degrades to the code block (obligation 5) instead of to a broken image.
  if (!/^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*)*<svg[\s>]/.test(svg)) {
    onError?.(new Error(`drawer for "${language}" did not return SVG`), language);
    return null;
  }
  return svg;
}

function image(svg: string, language: string, alt: string): Element {
  return {
    type: "element",
    tagName: "img",
    properties: {
      className: ["ms-diagram"],
      dataDiagram: language,
      // encodeURIComponent rather than a minimal escape: it is longer but it
      // cannot be wrong, and an SVG small enough to be a diagram is small
      // enough that the difference does not matter.
      src: `data:image/svg+xml,${encodeURIComponent(svg.trim())}`,
      alt,
    },
    children: [],
  };
}

/** The info string, from the `language-x` class mdast-util-to-hast writes. */
function languageOf(code: Element): string | null {
  const classes = code.properties.className;
  if (!Array.isArray(classes)) return null;
  for (const name of classes) {
    if (typeof name === "string" && name.startsWith("language-")) return name.slice("language-".length);
  }
  return null;
}

function hasClass(node: Element, name: string): boolean {
  const classes = node.properties.className;
  return Array.isArray(classes) && classes.includes(name);
}

function textOf(node: HastNodes): string {
  if (node.type === "text") return node.value;
  if (node.type === "comment" || node.type === "doctype") return "";
  return (node as Parent).children.map(textOf).join("");
}
