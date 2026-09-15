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
    assert.ok(css.includes(construct + ","), `${construct} must be in the full-width list`);
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
