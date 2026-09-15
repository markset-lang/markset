import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defaultStylesheetPath, html } from "../src/index.ts";

const render = (source: string) => html(source).html;

test("table header cells say what they head", () => {
  // A bare <th> leaves a screen reader to guess. A GFM table has one header
  // row and no row headers, so the renderer always knows the answer.
  const out = render("| a | b |\n|---|---|\n| 1 | 2 |\n");
  assert.match(out, /<th scope="col">a<\/th>/);
  assert.match(out, /<th scope="col">b<\/th>/);
  assert.doesNotMatch(out, /<td[^>]*scope=/, "body cells are not headers");
});

test("a callout is announced as an aside, named by its title", () => {
  const out = render("> [!WARNING] Breaking change\n> Body.\n");
  assert.match(out, /role="note"/);
  assert.match(out, /aria-labelledby="ms-callout-1-title"/);
  assert.match(out, /<div class="ms-callout-title" id="ms-callout-1-title">Breaking change<\/div>/);
});

test("a callout's own id is used for the title reference, so two callouts never collide", () => {
  const out = render("> [!NOTE] One\n> a\n\n> [!NOTE] Two\n> b\n");
  assert.match(out, /aria-labelledby="ms-callout-1-title"/);
  assert.match(out, /aria-labelledby="ms-callout-2-title"/);
  const withId = render("{#limits}\n> [!NOTE] Named\n> a\n");
  assert.match(withId, /aria-labelledby="limits-title"/);
});

test("a folding callout keeps its disclosure semantics instead of taking a role", () => {
  // On a <details>, role="note" would replace the semantics that tell a reader
  // there is something here to open, which is the more useful of the two.
  const out = render("> [!TIP]- Folded\n> Body.\n");
  assert.match(out, /<details class="ms-callout"/);
  assert.doesNotMatch(out, /role="note"/);
});

test("each tab panel is named after the label that opens it", () => {
  const out = render(":::tabs\n### macOS\n\nx\n\n### Windows\n\ny\n:::\n");
  assert.match(out, /<label class="ms-tab" id="ms-tabs-1-1-label" for="ms-tabs-1-1">macOS<\/label>/);
  assert.match(out, /<div class="ms-tabpanel" data-index="1" aria-labelledby="ms-tabs-1-1-label">/);
  assert.match(out, /<div class="ms-tabpanel" data-index="2" aria-labelledby="ms-tabs-1-2-label">/);
});

test("tabs claim no roles they cannot keep true", () => {
  // The tablist pattern needs aria-selected to follow the active tab. That is
  // dynamic state, it cannot be maintained without a script, and no script
  // anywhere is invariant 4. A tablist frozen at its initial value would be
  // worse than honest radio buttons, so the roles are deliberately absent.
  const out = render(":::tabs\n### A\n\nx\n\n### B\n\ny\n:::\n");
  for (const role of ["tablist", '"tab"', "tabpanel"]) {
    assert.doesNotMatch(out, new RegExp(`role=.?${role}`), `role ${role} cannot be kept true without a script`);
  }
  assert.doesNotMatch(out, /aria-selected/);
});

test("the step marker is decoration, not content", async () => {
  // The number is already carried by the <ol>. The generated content gets empty
  // alternative text so it is not read out a second time, with the plain
  // declaration left in front of it as the fallback.
  const css = await readFile(defaultStylesheetPath, "utf8");
  assert.match(css, /content: counter\(list-item\);[\s\S]{0,160}?content: counter\(list-item\) \/ "";/);
});
