/**
 * Draws a figure's table as a chart (spec §11).
 *
 * An engine, not part of the renderer, and shaped like `diagram-ascii`: a pure
 * function with no dependencies. Two things make it different from that one,
 * and both are deliberate.
 *
 * **It returns a tree, not a string.** §10 draws to an SVG string that the
 * renderer wraps in an `<img>` data URI, because a diagram engine on the CLI
 * path is an arbitrary command and raw markup from one is a channel documents
 * are denied (§4). This engine is not that: it is our own function, so it can
 * hand back constructed nodes the way every other handler in the renderer does.
 * There is no markup to parse and therefore no channel to open, which is how
 * obligation 6 survives the move from `<img>` to inline SVG.
 *
 * **It emits no color.** Not one hex value, no `fill` and no `stroke`: the
 * output carries geometry and series identity (`data-series`) and nothing else,
 * and `markset.css` colors it. That is the same contract every construct has —
 * the document names what a thing is, the stylesheet decides how it looks — and
 * it is the whole reason inline SVG was worth the second drawing path. A theme
 * colors a chart by setting `--ms-chart-1`, like any other token.
 */

export type ChartType = "line" | "bar" | "column";

export interface Series {
  /** The column header, which is the series' name. */
  name: string;
  /** One value per category, in order. `null` is a gap, never a zero (§11). */
  values: Array<number | null>;
}

export interface ChartData {
  /** Header of the first column: what the category axis is. */
  categoryLabel: string;
  categories: string[];
  series: Series[];
}

/**
 * The hast shapes this engine produces, declared here rather than imported so
 * the package keeps no dependency. Structurally what hast defines, so the
 * renderer can drop the result straight into its tree.
 */
export interface ChartElement {
  type: "element";
  tagName: string;
  properties: Record<string, string | number>;
  children: ChartNode[];
}
export interface ChartText {
  type: "text";
  value: string;
}
export type ChartNode = ChartElement | ChartText;

/** Fixed geometry, in viewBox units, which render as CSS pixels at full width. */
const W = 720;
const H = 340;
const PAD = { top: 16, right: 20, bottom: 40, left: 56 };
/**
 * Width of a label, estimated from its length.
 *
 * Text cannot be measured without a layout engine, and this function has none,
 * so every label decision here is made on an estimate that runs generous. Over-
 * reserving costs a little plot width; under-reserving clips a label, which is
 * the one outcome that is not allowed — a cropped first character is worse than
 * no label at all.
 */
const widthOf = (label: string) => label.length * 6.8;
const LEGEND_H = 28;
const BAR_MAX = 24; // §marks: cap the mark, let the band's leftover be air
const BAR_GAP = 2; // §marks: the surface gap that separates touching bars
const TICKS = 5;

const el = (
  tagName: string,
  properties: Record<string, string | number>,
  children: ChartNode[] = [],
): ChartElement => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value: string): ChartText => ({ type: "text", value });

/** Thousands separators without pulling in a locale, so output is deterministic. */
function format(n: number): string {
  const [whole, fraction] = Math.abs(n).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Axis bounds on round numbers, stepping 1, 2 or 5 times a power of ten.
 *
 * `fromZero` is not a matter of taste; it follows from what the mark encodes.
 * A bar says "this much" with its *length*, so a baseline anywhere but zero
 * misstates the ratio between bars, which is the one thing a bar chart is for.
 * A line says "this value" with its *position*, and a zero baseline it does not
 * need flattens the shape into the top of the frame — which throws away the
 * change the chart was drawn to show. So bars start at zero and lines fit their
 * data, and both are the honest reading of their own mark.
 */
function scale(values: number[], fromZero: boolean): { min: number; max: number; step: number } {
  const lo = fromZero ? Math.min(0, ...values) : Math.min(...values);
  const hi = fromZero ? Math.max(0, ...values) : Math.max(...values);
  if (lo === hi) return { min: Math.min(0, lo), max: hi + 1, step: 1 };
  const raw = (hi - lo) / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

function ticksOf(s: { min: number; max: number; step: number }): number[] {
  const out: number[] = [];
  // Accumulating with a counter rather than `t += step` keeps float error from
  // walking a tick off a round number and printing 2.9999999999999996.
  for (let i = 0; s.min + i * s.step <= s.max + s.step / 1000; i++) out.push(s.min + i * s.step);
  return out;
}

/** Band centers for n categories across a length, and the thickness of a mark in one. */
function bands(length: number, n: number, marksPerBand: number) {
  const band = length / n;
  const available = band * 0.7;
  const thickness = Math.min(BAR_MAX, (available - BAR_GAP * (marksPerBand - 1)) / marksPerBand);
  return { band, thickness: Math.max(1, thickness) };
}

/** A bar or column: square where it meets the baseline, rounded at the data end. */
function barPath(x: number, y: number, w: number, h: number, horizontal: boolean): string {
  const r = Math.min(4, horizontal ? w : h, (horizontal ? h : w) / 2);
  if (h <= 0 || w <= 0) return "";
  return horizontal
    ? `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`
    : `M${x},${y + h}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

/**
 * Draw, or return null when there is nothing to draw.
 *
 * Returning null rather than an empty picture is obligation 5: the renderer
 * keeps the table, and a chart that could not be drawn has removed nothing.
 */
export function chart(type: ChartType, data: ChartData): ChartElement | null {
  const series = data.series.filter((s) => s.values.some((v) => v !== null));
  if (!series.length || !data.categories.length) return null;

  const legend = series.length > 1;
  const top = PAD.top + (legend ? LEGEND_H : 0);
  const horizontal = type === "bar";
  const s = scale(
    series.flatMap((x) => x.values.filter((v): v is number => v !== null)),
    type !== "line",
  );
  // A bar chart's left margin holds category names, not numbers, so it is sized
  // from the longest of them rather than from the fixed inset that fits a tick.
  // Capped at a third of the width: past that the plot is the smaller half and
  // the picture stops being a chart.
  const gutter = horizontal
    ? Math.min(W / 3, Math.max(PAD.left, ...data.categories.map((c) => widthOf(c) + 14)))
    : PAD.left;
  // The last value tick on a horizontal axis is centred on the plot's right
  // edge, so half of it hangs past the viewBox unless the margin allows for it.
  const rightPad = horizontal ? Math.max(PAD.right, widthOf(format(s.max)) / 2 + 4) : PAD.right;
  const plot = {
    x: gutter,
    y: top,
    w: W - gutter - rightPad,
    h: H - top - PAD.bottom,
  };

  // The value axis runs up the page for line and column, and across it for bar.
  const valueAt = (v: number) =>
    horizontal
      ? plot.x + ((v - s.min) / (s.max - s.min)) * plot.w
      : plot.y + plot.h - ((v - s.min) / (s.max - s.min)) * plot.h;
  const categoryLength = horizontal ? plot.h : plot.w;
  const categoryAt = (i: number, band: number) => (horizontal ? plot.y : plot.x) + band * i + band / 2;

  const children: ChartNode[] = [];

  // --- gridlines and value ticks. Recessive by class, hairline, solid.
  const grid: ChartNode[] = [];
  for (const t of ticksOf(s)) {
    const at = valueAt(t);
    grid.push(
      el("line", {
        class: "ms-chart-grid",
        x1: horizontal ? at : plot.x,
        y1: horizontal ? plot.y : at,
        x2: horizontal ? at : plot.x + plot.w,
        y2: horizontal ? plot.y + plot.h : at,
      }),
    );
    grid.push(
      el(
        "text",
        {
          class: "ms-chart-tick",
          x: horizontal ? at : plot.x - 8,
          y: horizontal ? plot.y + plot.h + 16 : at + 4,
          "text-anchor": horizontal ? "middle" : "end",
        },
        [text(format(t))],
      ),
    );
  }
  children.push(el("g", { class: "ms-chart-axis" }, grid));

  // --- category labels, one per band, on the axis the categories belong to.
  const marksPerBand = type === "line" ? 1 : series.length;
  const { band, thickness } = bands(categoryLength, data.categories.length, marksPerBand);
  // Along a horizontal category axis the labels sit side by side and can run
  // into each other. Rather than clip or overlap, show every nth, chosen so the
  // widest fits its slot: the table carries every category regardless, so
  // thinning the axis loses a reader nothing.
  const widest = Math.max(...data.categories.map(widthOf));
  const every = horizontal ? 1 : Math.max(1, Math.ceil((widest + 8) / band));
  const labels: ChartNode[] = data.categories
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => i % every === 0)
    .map(({ name, i }) => {
      const at = categoryAt(i, band);
      return el(
        "text",
        {
          class: "ms-chart-tick",
          x: horizontal ? plot.x - 8 : at,
          y: horizontal ? at + 4 : plot.y + plot.h + 20,
          "text-anchor": horizontal ? "end" : "middle",
        },
        [text(name)],
      );
    });
  children.push(el("g", { class: "ms-chart-axis" }, labels));

  // --- the baseline, drawn after the grid so it reads as the anchor.
  const zero = valueAt(Math.max(s.min, Math.min(0, s.max)));
  children.push(
    el("line", {
      class: "ms-chart-baseline",
      x1: horizontal ? zero : plot.x,
      y1: horizontal ? plot.y : zero,
      x2: horizontal ? zero : plot.x + plot.w,
      y2: horizontal ? plot.y + plot.h : zero,
    }),
  );

  // --- the marks.
  series.forEach((one, si) => {
    const slot = (si % 8) + 1; // §palette: fixed order, folded rather than generated
    if (type === "line") {
      // A gap is a break in the line, not a jump through zero: consecutive runs
      // are drawn as separate polylines so a missing point leaves a hole.
      let run: string[] = [];
      const runs: string[][] = [];
      one.values.forEach((v, i) => {
        if (v === null) {
          if (run.length) runs.push(run);
          run = [];
          return;
        }
        run.push(`${categoryAt(i, band)},${valueAt(v)}`);
      });
      if (run.length) runs.push(run);
      for (const points of runs) {
        if (points.length === 1) {
          const [x, y] = points[0].split(",");
          children.push(el("circle", { class: "ms-chart-dot", "data-series": slot, cx: x, cy: y, r: 4 }));
          continue;
        }
        children.push(el("polyline", { class: "ms-chart-line", "data-series": slot, points: points.join(" ") }));
      }
      return;
    }
    one.values.forEach((v, i) => {
      if (v === null) return;
      // Centred on the band, not started at a fixed inset: the marks are capped
      // at BAR_MAX, so a wide band leaves the group narrower than the space it
      // sits in, and a fixed inset would hang the whole group left of the label
      // it belongs to.
      const group = marksPerBand * thickness + (marksPerBand - 1) * BAR_GAP;
      const offset = (band - group) / 2 + si * (thickness + BAR_GAP);
      const at = (horizontal ? plot.y : plot.x) + band * i + offset;
      const from = valueAt(Math.max(s.min, Math.min(0, s.max)));
      const to = valueAt(v);
      const d = horizontal
        ? barPath(Math.min(from, to), at, Math.abs(to - from), thickness, true)
        : barPath(at, Math.min(from, to), thickness, Math.abs(to - from), false);
      if (d) children.push(el("path", { class: "ms-chart-bar", "data-series": slot, d }));
    });
  });

  // --- legend, for two series or more. One series is named by the caption.
  if (legend) {
    const items: ChartNode[] = [];
    let x = PAD.left;
    series.forEach((one, si) => {
      const slot = (si % 8) + 1;
      items.push(el("rect", { class: "ms-chart-key", "data-series": slot, x, y: PAD.top + 4, width: 10, height: 10 }));
      items.push(el("text", { class: "ms-chart-legend", x: x + 16, y: PAD.top + 13 }, [text(one.name)]));
      // Advanced by an estimate: text cannot be measured without a layout engine,
      // and over-reserving is the failure that costs nothing.
      x += 16 + one.name.length * 7.5 + 20;
    });
    children.push(el("g", {}, items));
  }

  return el(
    "svg",
    {
      class: "ms-chart",
      "data-chart": type,
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      // The table beside it is the accessible form and carries every value, so
      // announcing the picture as well would say the same thing twice. Same
      // reasoning as the step markers in §4.6: claim only what is not already
      // claimed. Obligation 8 is what makes this safe rather than lossy.
      "aria-hidden": "true",
    },
    children,
  );
}
