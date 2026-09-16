/**
 * ASCII diagram to SVG (spec §10).
 *
 * This is a *engine*, not part of the renderer: `@markset/render-html` ships no
 * engine and draws nothing on its own. It is a pure string-to-string function
 * with no dependencies and no I/O, which is what lets it sit in a format whose
 * fourth invariant is that nothing evaluates anything — there is no evaluation
 * here, only the same kind of transformation the downgrade renderer performs.
 *
 * Why ASCII gets an engine in this repository when nothing else does: §10's
 * closing argument. Every other diagram source falls back to its own source
 * code, which is honest but is not a diagram. ASCII falls back to a diagram,
 * because it already is one. It is the only common diagram source whose naive
 * output (§3) is as good as its rendered output.
 *
 * The supported subset, deliberately small and deliberately written down:
 *
 *   -  horizontal line        +  corner or junction
 *   |  vertical line          /  \  diagonal
 *   >  <  ^  v  arrowheads, recognized only where a line actually arrives
 *
 * Anything else is text. There is no box-detection pass, no layout, and no
 * attempt to be svgbob: a diagram is drawn exactly where the author put it,
 * cell by cell, so what renders is what is in the file.
 */

/** Character cell geometry. Everything else is derived from these three. */
const CELL_W = 8;
const CELL_H = 16;
const PAD = 6;

const H_LINE = new Set(["-", "+"]);
const V_LINE = new Set(["|", "+"]);
/** Every character the engine can consume, plus the space that separates them. */
const DRAWING = new Set(["-", "|", "+", "/", "\\", ">", "<", "^", "v", " "]);

/**
 * A character that belongs to a word rather than to the drawing.
 *
 * This exists for one case, found by a real diagram: a lone hyphen inside a
 * label. "region: us-east" has a dash between two letters, and an engine that
 * takes every dash for a line turns the label into "us" and "east" joined by a
 * rule. So a single - or | with word characters on both sides is text. Two or
 * more in a row is still a line, because nobody writes "a--b" in a label and
 * people do draw short connectors.
 */
function isWordish(char: string): boolean {
  return char !== "" && !DRAWING.has(char);
}

/** Draw an ASCII diagram. Returns SVG markup, or null when there is nothing to draw. */
export function drawAscii(source: string): string | null {
  const rows = source.replace(/\s+$/u, "").split("\n").map(expandTabs);
  if (rows.length === 0 || rows.every((row) => row.trim() === "")) return null;

  const columns = Math.max(...rows.map((row) => row.length));
  const at = (x: number, y: number): string => rows[y]?.[x] ?? " ";
  // Cells claimed by a line, an arrowhead or a diagonal. What is left is text.
  const used = rows.map(() => new Array<boolean>(columns).fill(false));
  const claim = (x: number, y: number): void => {
    const row = used[y];
    if (row) row[x] = true;
  };

  const lines: string[] = [];
  const heads: string[] = [];

  const arrow = (x: number, y: number): "right" | "left" | "down" | "up" | null => {
    // An arrowhead is only an arrowhead where a line arrives, which is what
    // keeps the letter v in ordinary text from sprouting a triangle.
    const c = at(x, y);
    if (c === ">" && H_LINE.has(at(x - 1, y))) return "right";
    if (c === "<" && H_LINE.has(at(x + 1, y))) return "left";
    if (c === "v" && V_LINE.has(at(x, y - 1))) return "down";
    if (c === "^" && V_LINE.has(at(x, y + 1))) return "up";
    return null;
  };

  // Horizontal runs. A run is a maximal span of - and + holding at least one
  // -, so a lone + (a junction owned by a vertical line) does not become a
  // one-cell dash.
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    while (x < columns) {
      if (!H_LINE.has(at(x, y))) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < columns && H_LINE.has(at(end + 1, y))) end++;
      const loneDash = end === x && at(x, y) === "-" && isWordish(at(x - 1, y)) && isWordish(at(x + 1, y));
      if (!loneDash && rows[y].slice(x, end + 1).includes("-")) {
        for (let i = x; i <= end; i++) claim(i, y);
        const cy = y * CELL_H + CELL_H / 2;
        lines.push(
          line(
            runStart(x, at(x, y), at(x - 1, y), arrow(x - 1, y) !== null, CELL_W, "|"),
            cy,
            runEnd(end, at(end, y), at(end + 1, y), arrow(end + 1, y) !== null, CELL_W, "|"),
            cy,
          ),
        );
      }
      x = end + 1;
    }
  }

  // Vertical runs, by the same rule.
  for (let x = 0; x < columns; x++) {
    let y = 0;
    while (y < rows.length) {
      if (!V_LINE.has(at(x, y))) {
        y++;
        continue;
      }
      let end = y;
      while (end + 1 < rows.length && V_LINE.has(at(x, end + 1))) end++;
      let hasPipe = false;
      for (let i = y; i <= end; i++) if (at(x, i) === "|") hasPipe = true;
      const lonePipe = end === y && at(x, y) === "|" && isWordish(at(x - 1, y)) && isWordish(at(x + 1, y));
      if (hasPipe && !lonePipe) {
        for (let i = y; i <= end; i++) claim(x, i);
        const cx = x * CELL_W + CELL_W / 2;
        lines.push(
          line(
            cx,
            runStart(y, at(x, y), at(x, y - 1), arrow(x, y - 1) !== null, CELL_H, "-"),
            cx,
            runEnd(end, at(x, end), at(x, end + 1), arrow(x, end + 1) !== null, CELL_H, "-"),
          ),
        );
      }
      y = end + 1;
    }
  }

  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < columns; x++) {
      const direction = arrow(x, y);
      if (direction) {
        claim(x, y);
        heads.push(head(x, y, direction));
        continue;
      }
      const c = at(x, y);
      if (c === "/" || c === "\\") {
        claim(x, y);
        const left = x * CELL_W;
        const right = (x + 1) * CELL_W;
        const top = y * CELL_H;
        const bottom = (y + 1) * CELL_H;
        lines.push(c === "/" ? line(left, bottom, right, top) : line(left, top, right, bottom));
      }
    }
  }

  // Whatever is left is text, grouped into runs so a word is one element.
  const texts: string[] = [];
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    while (x < columns) {
      if (used[y][x] || at(x, y) === " ") {
        x++;
        continue;
      }
      // A single space keeps a phrase in one run: textLength pins the whole
      // run to its cells, spaces included, so merging costs no alignment and
      // saves an element per word. A wider gap is a real gap and ends the run.
      let end = x;
      for (;;) {
        const next = end + 1;
        if (next >= columns || used[y][next]) break;
        if (at(next, y) !== " ") {
          end = next;
        } else if (next + 1 < columns && !used[y][next + 1] && at(next + 1, y) !== " ") {
          end = next + 1;
        } else {
          break;
        }
      }
      texts.push(text(rows[y].slice(x, end + 1), x, y));
      x = end + 1;
    }
  }

  const width = columns * CELL_W + PAD * 2;
  const height = rows.length * CELL_H + PAD * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    STYLE,
    `<g transform="translate(${PAD} ${PAD})">`,
    ...lines,
    ...heads,
    ...texts,
    "</g>",
    "</svg>",
  ].join("\n");
}

/**
 * Where a run begins. A + is a corner, so the line stops at its center and the
 * crossing line does the same, which is what makes a join look like a join. A
 * dash runs to the cell edge instead, and an arrowhead beyond it takes over
 * exactly at that edge, so the two meet with no seam. And a run that arrives at
 * a line of the other orientation — a dash meeting the | wall of a box — runs on
 * to that line's center rather than stopping at the cell boundary half a cell
 * short of it, which is the difference between an arrow touching a box and an
 * arrow pointing near one. A real architecture diagram is what exposed it.
 */
function runStart(
  index: number,
  char: string,
  before: string,
  arrowBefore: boolean,
  size: number,
  perp: string,
): number {
  if (arrowBefore) return index * size;
  if (before === perp) return (index - 1) * size + size / 2;
  return char === "+" ? index * size + size / 2 : index * size;
}

function runEnd(index: number, char: string, after: string, arrowAfter: boolean, size: number, perp: string): number {
  if (arrowAfter) return (index + 1) * size;
  if (after === perp) return (index + 1) * size + size / 2;
  return char === "+" ? index * size + size / 2 : (index + 1) * size;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<path class="l" d="M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}"/>`;
}

function head(x: number, y: number, direction: "right" | "left" | "down" | "up"): string {
  const cx = x * CELL_W + CELL_W / 2;
  const cy = y * CELL_H + CELL_H / 2;
  const long = CELL_W * 0.75;
  const wide = CELL_W * 0.45;
  const points =
    direction === "right"
      ? [
          [cx + long, cy],
          [cx - long, cy - wide],
          [cx - long, cy + wide],
        ]
      : direction === "left"
        ? [
            [cx - long, cy],
            [cx + long, cy - wide],
            [cx + long, cy + wide],
          ]
        : direction === "down"
          ? [
              [cx, cy + long],
              [cx - wide, cy - long],
              [cx + wide, cy - long],
            ]
          : [
              [cx, cy - long],
              [cx - wide, cy + long],
              [cx + wide, cy + long],
            ];
  return `<polygon class="h" points="${points.map(([px, py]) => `${round(px)},${round(py)}`).join(" ")}"/>`;
}

/**
 * One run of text, pinned to the grid.
 *
 * textLength is not decoration: the diagram's alignment is the author's, and a
 * monospace font that is a fraction of a pixel off per character walks a label
 * out of its box over twenty characters. Pinning each run to its exact cell
 * width means the SVG lines up on a machine that has none of the named fonts.
 */
function text(value: string, x: number, y: number): string {
  const width = value.length * CELL_W;
  return (
    `<text class="t" x="${x * CELL_W}" y="${y * CELL_H + CELL_H * 0.72}" ` +
    `textLength="${width}" lengthAdjust="spacing">${escapeXml(value)}</text>`
  );
}

/**
 * Colors travel with the picture.
 *
 * An SVG embedded as a data URI cannot read the page's custom properties, but
 * prefers-color-scheme inside it resolves against the embedding page's
 * color-scheme, so a reader who forces light or dark through §6's data-scheme
 * gets a diagram that follows. Measured in Chrome, 2026-09-15.
 *
 * This is XML, so no raw angle bracket or ampersand may appear in here.
 */
const STYLE = `<style>
.l { fill: none; stroke: #1f2328; stroke-width: 1.5; stroke-linecap: round }
.h { fill: #1f2328 }
.t { fill: #1f2328; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px }
@media (prefers-color-scheme: dark) {
.l { stroke: #e6edf3 }
.h { fill: #e6edf3 }
.t { fill: #e6edf3 }
}
</style>`;

function expandTabs(row: string): string {
  return row.replace(/\t/gu, "    ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}
