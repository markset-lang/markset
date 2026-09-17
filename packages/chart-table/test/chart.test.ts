import { test } from "node:test";
import assert from "node:assert/strict";
import { chart, type ChartData, type ChartElement, type ChartNode } from "../src/index.ts";

const data = (series: Array<{ name: string; values: Array<number | null> }>, categories = ["Q1", "Q2", "Q3"]) =>
  ({ categoryLabel: "Quarter", categories, series }) satisfies ChartData;

const one = data([{ name: "Total", values: [5, 9, 7] }]);
const two = data([
  { name: "a", values: [5, 9, 7] },
  { name: "b", values: [2, 3, 4] },
]);

function walk(node: ChartNode, visit: (n: ChartElement) => void): void {
  if (node.type !== "element") return;
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function all(node: ChartNode): ChartElement[] {
  const out: ChartElement[] = [];
  walk(node, (n) => out.push(n));
  return out;
}

function textOf(node: ChartNode): string {
  if (node.type === "text") return node.value;
  return node.children.map(textOf).join("");
}

test("every type draws, and says which it is", () => {
  for (const type of ["line", "bar", "column"] as const) {
    const svg = chart(type, two);
    assert.ok(svg, `${type} draws`);
    assert.equal(svg.tagName, "svg");
    assert.equal(svg.properties["data-chart"], type);
  }
});

test("nothing to draw returns null rather than an empty picture", () => {
  // Obligation 5: the renderer keeps the table, so declining removes nothing.
  assert.equal(chart("line", data([{ name: "a", values: [null, null, null] }])), null);
  assert.equal(chart("line", data([], [])), null);
  assert.equal(chart("bar", data([{ name: "a", values: [] }], [])), null);
});

test("the engine emits no color at all", () => {
  // The whole reason charts are inline SVG rather than an <img>: the picture
  // carries geometry and a series number, and markset.css decides how it looks.
  // A hex value here would be a presentational decision in the wrong place, and
  // it would silently stop themes working.
  for (const type of ["line", "bar", "column"] as const) {
    for (const node of all(chart(type, two) as ChartElement)) {
      for (const [key, value] of Object.entries(node.properties)) {
        assert.ok(!/^(fill|stroke|color)$/.test(key), `${type}: ${node.tagName} sets ${key}`);
        assert.doesNotMatch(String(value), /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, `${type}: ${key} carries a color`);
      }
    }
  }
});

test("the tree is inert: no script, no href, no event handler, no foreign content", () => {
  // Obligation 6. With an <img> data URI this held because of the shape of the
  // output; inline, it holds because this engine constructs its own nodes and
  // never parses markup. That is a claim about this code, so it is tested.
  for (const type of ["line", "bar", "column"] as const) {
    for (const node of all(chart(type, two) as ChartElement)) {
      assert.ok(!/^(script|foreignObject|iframe|image|use|a)$/i.test(node.tagName), `drew a ${node.tagName}`);
      for (const key of Object.keys(node.properties)) {
        assert.doesNotMatch(key, /^on/i, `${node.tagName} carries ${key}`);
        assert.doesNotMatch(key, /^(href|xlinkHref|xlink:href|src)$/i, `${node.tagName} carries ${key}`);
      }
    }
  }
});

test("a legend appears for two series and not for one", () => {
  // A single series needs no legend: there is one color and the caption already
  // says what is plotted, so a box with one swatch restates the caption.
  const keys = (svg: ChartElement) => all(svg).filter((n) => n.properties.class === "ms-chart-key");
  assert.equal(keys(chart("line", one) as ChartElement).length, 0);
  assert.equal(keys(chart("line", two) as ChartElement).length, 2);
});

test("a gap breaks the line instead of dropping through zero", () => {
  // §11: a cell that is not a number is a missing point, never a zero. Drawn as
  // one polyline it would dive to the baseline and back, inventing a fall.
  const svg = chart("line", data([{ name: "a", values: [5, null, 7] }])) as ChartElement;
  const lines = all(svg).filter((n) => n.tagName === "polyline");
  const dots = all(svg).filter((n) => n.tagName === "circle");
  assert.equal(lines.length, 0, "two isolated points are not a line");
  assert.equal(dots.length, 2, "each is drawn as a point of its own");
});

const ticksOf = (svg: ChartElement) =>
  all(svg)
    .filter((n) => n.properties.class === "ms-chart-tick")
    .map(textOf);

test("bars start at zero and lines fit their data", () => {
  // Not a preference: a bar encodes magnitude as length, so a truncated
  // baseline misstates the ratio between bars. A line encodes it as position,
  // and forcing zero there flattens the shape the chart was drawn to show.
  const values = [{ name: "a", values: [100, 105, 110] }];
  assert.ok(ticksOf(chart("column", data(values)) as ChartElement).includes("0"), "a column starts at zero");
  assert.ok(ticksOf(chart("bar", data(values)) as ChartElement).includes("0"), "a bar starts at zero");
  const line = ticksOf(chart("line", data(values)) as ChartElement);
  assert.ok(!line.includes("0"), `a line fits its data; ticks were ${line.join(", ")}`);
  assert.ok(line.includes("100"), `and still lands on round numbers; ticks were ${line.join(", ")}`);
});

test("axis ticks land on round numbers, thousands separated", () => {
  const svg = chart("column", data([{ name: "a", values: [1200, 6400, 9100] }])) as ChartElement;
  const ticks = ticksOf(svg);
  assert.ok(ticks.includes("10,000"), `ticks were ${ticks.join(", ")}`);
  for (const t of ticks.filter((t) => /^[\d,]+$/.test(t))) {
    assert.match(t, /^\d{1,3}(,\d{3})*$/, `${t} is grouped`);
  }
});

test("a bar chart's gutter grows to fit its category names", () => {
  // Estimated rather than measured, because there is no layout engine here. The
  // test is that a long name moves the plot, not that the estimate is exact: a
  // clipped label is the one outcome that is not allowed.
  const short = chart("bar", data([{ name: "a", values: [1, 2, 3] }], ["a", "b", "c"])) as ChartElement;
  const long = chart(
    "bar",
    data([{ name: "a", values: [1, 2, 3] }], ["a very long category name indeed", "b", "c"]),
  ) as ChartElement;
  const firstGrid = (svg: ChartElement) =>
    Number(all(svg).find((n) => n.properties.class === "ms-chart-grid")?.properties.x1);
  assert.ok(firstGrid(long) > firstGrid(short), "the plot starts further right when the names are longer");
});

test("categories that would collide are thinned rather than overlapped", () => {
  const many = Array.from({ length: 40 }, (_, i) => `category ${i}`);
  const svg = chart("column", data([{ name: "a", values: many.map((_, i) => i) }], many)) as ChartElement;
  const labels = all(svg).filter((n) => n.properties.class === "ms-chart-tick" && /^category/.test(textOf(n)));
  assert.ok(labels.length > 0, "some categories are still labelled");
  assert.ok(labels.length < many.length, `all ${many.length} were drawn on top of each other`);
});

test("a ninth series folds back to the first slot rather than inventing a color", () => {
  const nine = data(Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, values: [1, 2, 3] })));
  const svg = chart("line", nine) as ChartElement;
  const slots = all(svg)
    .filter((n) => n.properties["data-series"] !== undefined)
    .map((n) => Number(n.properties["data-series"]));
  assert.deepEqual(
    [...new Set(slots)].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("the picture is hidden from assistive technology, because the table is not", () => {
  // §11 obligation 8 keeps the table, and the table carries every value with a
  // caption naming it. Announcing the picture too would say the same thing
  // twice; same reasoning as the step markers in §4.6.
  assert.equal((chart("line", two) as ChartElement).properties["aria-hidden"], "true");
});
