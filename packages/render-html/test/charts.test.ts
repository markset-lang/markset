import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset-lang/parser";
import { renderHtml } from "../src/index.ts";

const render = (source: string, options = {}) => renderHtml(parseDocument(source).ast, options);

const TABLE = "| Quarter | us-east | eu-west |\n|---|---|---|\n| Q1 | 120 | 64 |\n| Q2 | 140 | 71 |\n";
const CHART = `:::figure[Requests by region]{chart=column}\n${TABLE}:::\n`;

test("a chart is drawn, and its table is still there", () => {
  // Obligation 8, which is the one charts have and diagrams do not. The picture
  // is a lossy view of data that is right there; taking the table away would
  // discard something every reader could have used, not only one who cannot see.
  const out = render(CHART);
  assert.match(out, /<svg class="ms-chart"/);
  assert.match(out, /<table>/);
  assert.match(out, /<td>120<\/td>/);
  assert.ok(out.indexOf("<svg") < out.indexOf("<table>"), "the picture comes first");
});

test("charts: false draws nothing and keeps every number", () => {
  const out = render(CHART, { charts: false });
  assert.doesNotMatch(out, /<svg/);
  assert.match(out, /<td>140<\/td>/);
  assert.match(out, /data-chart="column"/, "the figure still says what it asked for");
});

test("a figure with no chart attribute is untouched", () => {
  const out = render(`:::figure[Just a table]\n${TABLE}:::\n`);
  assert.doesNotMatch(out, /<svg/);
});

test("an uncaptioned chart is not drawn", () => {
  // Obligation 7: the caption says what the picture shows, and a drawn chart
  // without one claims more than it can support.
  const out = render(`:::figure{chart=column}\n${TABLE}:::\n`);
  assert.doesNotMatch(out, /<svg/);
  assert.match(out, /<table>/);
});

test("an engine that throws leaves the table alone", () => {
  // Obligation 5. A failed chart never removes content.
  const errors: string[] = [];
  const out = render(CHART, {
    charts: {
      engine: () => {
        throw new Error("nope");
      },
      onError: (error: Error) => errors.push(error.message),
    },
  });
  assert.doesNotMatch(out, /<svg/);
  assert.match(out, /<td>64<\/td>/);
  assert.deepEqual(errors, ["nope"]);
});

test("drawing does not change the AST", () => {
  // Obligation 3. Rendering twice from one tree must give the same answer, and
  // the tree must still downgrade to the table afterwards.
  const { ast } = parseDocument(CHART);
  const before = JSON.stringify(ast);
  renderHtml(ast);
  assert.equal(JSON.stringify(ast), before, "the mdast the caller handed us is untouched");
});

test("the series mapping is §11's: first column categories, the rest series", () => {
  const out = render(CHART);
  // Two series means two legend keys and two colors in play.
  assert.match(out, /data-series="1"/);
  assert.match(out, /data-series="2"/);
  assert.doesNotMatch(out, /data-series="3"/);
  assert.match(out, />us-east</, "the header names the series");
  assert.match(out, />Q1</, "the first column is the category axis");
});

test("numbers written for people still reach the chart", () => {
  // A document says "1,200" and "$4.10" and "26%". Dropping those rows would
  // draw a different argument from the one on the page.
  const out = render(
    ":::figure[Cost]{chart=bar}\n| Tier | Cost |\n|---|---|\n| Workspace | $4.10 |\n| Archive | 1,200 |\n:::\n",
  );
  assert.match(out, /<svg class="ms-chart"/);
  assert.match(out, /<path class="ms-chart-bar"/);
});

test("a column of text is a chart with nothing to draw, and stays a table", () => {
  const out = render(":::figure[Owners]{chart=bar}\n| Tier | Owner |\n|---|---|\n| A | Platform |\n:::\n");
  assert.doesNotMatch(out, /<svg/);
  assert.match(out, /<td>Platform<\/td>/);
});

test("nothing script-bearing reaches the output", () => {
  // Obligation 6. Inline SVG gives up the "inert because it is an <img>"
  // argument, so the property is asserted here as well as in the engine.
  const out = render(CHART);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /\son[a-z]+=/i);
  assert.doesNotMatch(out, /<foreignObject/i);
});
