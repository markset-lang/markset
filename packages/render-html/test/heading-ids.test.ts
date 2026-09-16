import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset-lang/parser";
import { addHeadingIds, headingSlug, renderHtml } from "../src/index.ts";

const render = (source: string, options?: { headingIds?: boolean }) => renderHtml(parseDocument(source).ast, options);

test("every heading gets an id derived from its text", () => {
  const html = render("# Getting started\n\n## The `id` key\n");
  assert.match(html, /<h1 id="getting-started">/);
  // Code and emphasis markers come off before the slug, so prose and code read alike.
  assert.match(html, /<h2 id="the-id-key">/);
});

test("an explicit id always wins, and reserves its slug", () => {
  const html = render("{#overview}\n# Getting started\n\n## Getting started\n");
  assert.match(html, /<h1 id="overview">/);
  // The second heading may take the slug the first one did not use.
  assert.match(html, /<h2 id="getting-started">/);
});

test("collisions get a numeric suffix in document order", () => {
  const html = render("## Notes\n\n## Notes\n\n## Notes\n");
  assert.match(html, /<h2 id="notes">Notes<\/h2>/);
  assert.match(html, /<h2 id="notes-2">Notes<\/h2>/);
  assert.match(html, /<h2 id="notes-3">Notes<\/h2>/);
});

test("a generated slug never collides with an explicit id anywhere in the tree", () => {
  const html = render("{#notes}\n# Title\n\n## Notes\n");
  assert.match(html, /<h1 id="notes">Title<\/h1>/);
  assert.match(html, /<h2 id="notes-2">Notes<\/h2>/);
});

test("letters outside ASCII are kept rather than stripped", () => {
  // Lowercasing and discarding non-ASCII would reduce these to nothing and every
  // heading in the document would become "section", "section-2", "section-3".
  assert.equal(headingSlug("Café périphérique"), "café-périphérique");
  assert.equal(headingSlug("Документация"), "документация");
  assert.equal(headingSlug("設定"), "設定");
  assert.equal(headingSlug("!?—"), "section");
  assert.equal(headingSlug("  Trailing and  inner   space "), "trailing-and-inner-space");
});

test("headings inside constructs are linkable; a tab's label is not a heading", () => {
  const steps = render(":::steps\n1. ### Install it\n\n   body\n:::\n");
  assert.match(steps, /<h3 id="install-it">/);
  // A tab heading is consumed into the tab's label, so there is no heading to link.
  const tabs = render(":::tabs\n### macOS\n\nx\n:::\n");
  assert.doesNotMatch(tabs, /id="macos"/);
});

test("the pass is idempotent and can be turned off", () => {
  const { ast } = parseDocument("## Notes\n\n## Notes\n");
  const once = addHeadingIds(ast);
  const twice = addHeadingIds(once);
  assert.equal(renderHtml(once, { headingIds: false }), renderHtml(twice, { headingIds: false }));
  assert.doesNotMatch(render("# Title\n", { headingIds: false }), /id=/);
});
