import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset/parser";
import { bodyAttributes, html, renderHtml, renderPage } from "../src/index.ts";

// Fragment shapes are pinned in tests/*.json; these cover the page wrapper
// and renderer state.

test("tab input names restart per render, so documents do not share ids", () => {
  const source = ":::tabs\n### A\n:::\n\n:::tabs\n### B\n:::\n";
  const first = html(source).html;
  const second = html(source).html;
  assert.equal(first, second);
  assert.match(first, /name="ms-tabs-1"/);
  assert.match(first, /name="ms-tabs-2"/);
});

test("renderPage wraps the fragment and carries theme tokens onto body", () => {
  const source = "---\nmarkset: 0\ntheme:\n  preset: deck\n  accent: \"#2563eb\"\n  density: compact\n  radius: lg\n  type:\n    body: \"Source Serif 4\"\n    heading: Inter\n    scale: 1.25\n---\n\n# Hello & World\n";
  const { ast } = parseDocument(source);
  const page = renderPage(ast, { stylesheet: { href: "markset.css" } });
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.match(page, /<title>Hello &amp; World<\/title>/);
  assert.match(page, /<link rel="stylesheet" href="markset.css">/);
  assert.ok(page.includes('<body data-preset="deck" data-density="compact" data-radius="lg" style="--ms-accent: #2563eb; --ms-font-body: &quot;Source Serif 4&quot;; --ms-font-heading: &quot;Inter&quot;; --ms-type-scale: 1.25">'), page);
  assert.ok(page.includes('<main class="ms-document">\n<h1>Hello &#x26; World</h1>\n</main>'), page);
});

test("body attributes are empty without a theme", () => {
  assert.equal(bodyAttributes(null), "");
  assert.equal(bodyAttributes({ markset: 0, theme: null }), "");
});

test("inline stylesheet and explicit title", () => {
  const { ast } = parseDocument("text\n");
  const page = renderPage(ast, { title: "Custom", stylesheet: { inline: "body{margin:0}" } });
  assert.match(page, /<title>Custom<\/title>/);
  assert.match(page, /<style>\nbody\{margin:0\}\n<\/style>/);
});

test("raw HTML in the source is not passed through", () => {
  assert.equal(renderHtml(parseDocument("<script>alert(1)</script>\n\ntext <b>bold</b>\n").ast), "<p>text bold</p>\n");
});

test("empty document renders to an empty string", () => {
  assert.equal(renderHtml(parseDocument("").ast), "");
});
