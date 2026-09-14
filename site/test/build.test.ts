import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "../build.ts";

const dist = resolve(import.meta.dirname, "..", "..", "dist");

test("the site builds, every page has the shell, and links stay relative", async () => {
  const pages = await build();
  assert.ok(pages.includes("index.html"));
  assert.ok(pages.includes("spec/index.html"));
  assert.ok(pages.includes("guide/card/index.html"));
  assert.ok(pages.includes("conformance/grid/index.html"));
  assert.ok(pages.length >= 25, `only ${pages.length} pages`);
  for (const page of pages) {
    const html = await readFile(join(dist, page), "utf8");
    assert.match(html, /<nav class="site-nav">/, page);
    assert.doesNotMatch(html, /href="\//, `${page} has a root-relative link`);
    assert.doesNotMatch(html, /<script/, `${page} contains a script`);
  }
  const spec = await readFile(join(dist, "spec", "index.html"), "utf8");
  assert.match(spec, /<aside class="site-toc">/);
  assert.match(spec, /<h2 id="2-grammar">/);
  const home = await readFile(join(dist, "index.html"), "utf8");
  assert.match(home, /<div class="ms-metrics">/, "home renders a live metrics block");
  assert.match(home, /<p class="lead">/, "attribute line applied on the home page");
});
