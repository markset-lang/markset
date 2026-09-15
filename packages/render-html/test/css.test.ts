import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defaultStylesheetPath } from "../src/index.ts";

/**
 * The preset measures are a design decision that was reviewed on screen, and
 * they live in a stylesheet where an unrelated edit can move them without
 * anyone noticing. Pin them here: changing a width means changing this table in
 * the same commit, which puts it in the diff where it can be argued with.
 */
const MEASURES: Array<[string, string, string]> = [
  ["body", "56rem", "72rem"],
  ['body[data-preset="editorial"]', "44rem", "64rem"],
  ['body[data-preset="technical"]', "60rem", "72rem"],
  ['body[data-preset="deck"]', "64rem", "80rem"],
  ['body[data-preset="report"]', "56rem", "72rem"],
];

test("every preset keeps the reading and wide measures it was reviewed with", async () => {
  const css = await readFile(defaultStylesheetPath, "utf8");
  for (const [selector, measure, wide] of MEASURES) {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start !== -1, `no rule for ${selector}`);
    const block = css.slice(start, css.indexOf("}", start));
    assert.match(block, new RegExp(`--ms-measure:\\s*${measure};`), `${selector} reading measure`);
    assert.match(block, new RegExp(`--ms-measure-wide:\\s*${wide};`), `${selector} wide measure`);
  }
});

test("prose is capped at the reading measure and layout constructs are not", async () => {
  const css = await readFile(defaultStylesheetPath, "utf8");
  // Capped at 100% as well: as a grid item beside the spec page's table of
  // contents, `margin: 0 auto` turns off stretch and the box would otherwise
  // shrink-to-fit past its track. border-box keeps the padding inside that cap.
  assert.match(css, /\.ms-document \{[^}]*max-width: min\(var\(--ms-measure-wide\), 100%\)/s);
  assert.match(css, /\.ms-document \{[^}]*box-sizing: border-box/s);
  assert.match(css, /\.ms-document > \*[^{]*\{[^}]*max-width: var\(--ms-measure\)/);
  for (const construct of ["ms-grid", "ms-columns", "ms-metrics", "ms-tabs", "ms-figure"]) {
    assert.ok(css.includes(`${construct},`), `${construct} must be in the full-width list`);
  }
});

test("wide tables scroll inside themselves on narrow viewports", async () => {
  // Without this, one wide table pushes the whole page sideways and every other
  // block drifts with it. Measured: the spec page went past 1000px at a 390px
  // viewport, while pages with no table sat exactly at the viewport width.
  const css = await readFile(defaultStylesheetPath, "utf8");
  const narrow = /@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(narrow, "no narrow-viewport block");
  assert.match(narrow[1], /\.ms-document table \{[^}]*overflow-x: auto/);
  assert.match(narrow[1], /\.ms-document table \{[^}]*display: block/, "overflow is ignored on a table box");
});

test("grid items may shrink, so one long line cannot widen the page", async () => {
  const css = await readFile(defaultStylesheetPath, "utf8");
  const rule = /^\.ms-column, \.ms-grid-item.*\{ min-width: 0; \}$/m.exec(css);
  assert.ok(rule, "grid items need min-width: 0; without it they refuse to shrink below their content");
  for (const item of ["ms-column", "ms-grid-item", "ms-tabpanel", "ms-card"]) {
    assert.ok(rule[0].includes(item), `${item} is a grid or flex item and needs it too`);
  }
});

test("one palette, resolved by color-scheme, and a hook to force it", async () => {
  // Writing the dark palette as a second block under a media query means two
  // lists of colors to keep in sync, and no way for a reader on a dark system
  // to read the page in light. Each color is written once instead.
  const css = await readFile(defaultStylesheetPath, "utf8");
  assert.doesNotMatch(css, /@media \(prefers-color-scheme/, "the palette is not duplicated under a media query");
  assert.match(css, /color-scheme: light dark;/, "the document follows the reader by default");
  for (const token of ["--ms-fg", "--ms-bg", "--ms-surface", "--ms-border", "--ms-tone-danger"]) {
    assert.match(css, new RegExp(`${token}: light-dark\\(`), `${token} carries both values`);
  }
  assert.match(css, /body\[data-scheme="light"\] \{ color-scheme: light; \}/);
  assert.match(css, /body\[data-scheme="dark"\] \{ color-scheme: dark; \}/);
  // Paper is light even for a reader who chose dark on screen.
  assert.match(css, /body, body\[data-scheme="dark"\] \{ color-scheme: light;/);
});

test("no element keeps a browser default margin that the rhythm cannot reach", async () => {
  // Spacing is margin-top only. An element missing from the reset keeps its UA
  // bottom margin, which is in em and so ignores --ms-space: a figure sat 15px
  // below itself against a 10px rhythm at compact density, and looked fine at
  // the others only because the token was larger and collapsed over it.
  const css = await readFile(defaultStylesheetPath, "utf8");
  const reset = /\.ms-document :is\(([^)]*)\) \{ margin: 0; \}/.exec(css);
  assert.ok(reset, "the margin reset is a single :is() list");
  const gap = /\.ms-document \* \+ :is\(([^)]*)\) \{ margin-top: var\(--ms-space\); \}/.exec(css);
  assert.ok(gap, "and so is the list that gives them the standard gap");
  for (const tag of ["p", "ul", "ol", "blockquote", "pre", "table", "figure", "hr", "dl"]) {
    assert.ok(reset[1].includes(tag), `${tag} keeps a browser default margin`);
    assert.ok(gap[1].includes(tag), `${tag} is reset but never given the standard gap back`);
  }
});

test("a caption stays nearer the thing it captions than the block below it", async () => {
  // Spacing is what says the caption belongs to the table. At half a unit it
  // sat against the table's bottom rule and was nearly as far from the next
  // block as from its own table, so it read as floating between the two.
  // A full unit inside and two outside keeps the ratio at about 1:2, and the
  // ratio is what matters — both sides scale with the density token.
  const css = await readFile(defaultStylesheetPath, "utf8");
  assert.match(css, /\.ms-figure > figcaption, \.ms-figure caption \{ margin-top: var\(--ms-space\);/);
  assert.match(
    css,
    /\.ms-document > \.ms-figure \+ :where\(:not\(h1, h2, h3, h4, h5, h6\)\) \{ margin-top: calc\(var\(--ms-space\) \* 2\); \}/,
    "a figure needs more air after it than a block whose edge is its own border",
  );
});

test("a construct that draws its own edge gets more room than prose does", async () => {
  // Two lines of text are separated by their leading as well as by the margin,
  // so the gap that reads as comfortable between paragraphs reads as tight
  // against a border, which has no optical padding. Applied on both sides, or
  // the block appears to belong to whichever side happens to be nearer.
  const css = await readFile(defaultStylesheetPath, "utf8");
  const boxed =
    /\.ms-document > :where\(:not\(h1, h2, h3, h4, h5, h6\)\) \+ :is\(([^)]*)\),\n\.ms-document > :is\(([^)]*)\) \+ :where\(:not\(h1, h2, h3, h4, h5, h6\)\) \{\n\s*margin-top: calc\(var\(--ms-space\) \* 1\.5\);/.exec(
      css,
    );
  assert.ok(boxed, "the rule covers both sides, and excludes a heading on either");
  assert.equal(boxed[1], boxed[2], "the same constructs on both sides, or the spacing is lopsided");
  for (const c of [".ms-callout", ".ms-card", ".ms-metrics", ".ms-tabs", ".ms-grid"]) {
    assert.ok(boxed[1].includes(c), `${c} draws a border and is missing from the list`);
  }
  // steps and columns draw no box, so they keep the plain gap.
  for (const c of [".ms-steps", ".ms-columns"]) {
    assert.ok(!boxed[1].includes(c), `${c} draws no box and should not be in the list`);
  }
});
