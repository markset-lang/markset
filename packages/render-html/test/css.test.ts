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
  assert.match(css, /\.ms-document \{[^}]*max-width: var\(--ms-measure-wide\)/s);
  assert.match(css, /\.ms-document > \*[^{]*\{[^}]*max-width: var\(--ms-measure\)/);
  for (const construct of ["ms-grid", "ms-columns", "ms-metrics", "ms-tabs", "ms-figure"]) {
    assert.ok(css.includes(construct + ","), `${construct} must be in the full-width list`);
  }
});
