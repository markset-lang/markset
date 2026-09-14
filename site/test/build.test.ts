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

test("an example can carry a theme stylesheet, linked after the site's own", async () => {
  await build();
  const page = await readFile(join(dist, "examples", "notification-routing", "index.html"), "utf8");
  const site = page.indexOf("css/site.css");
  const theme = page.indexOf("css/dossier.css");
  assert.ok(site > 0 && theme > site, "the theme stylesheet must come last so it can override");
  assert.match(page, /<span class="ms-span chip model">/, "author classes reach the HTML");
  assert.match(page, /<div class="ms-column hot">/, "a separator's own attributes reach the column");
  await readFile(join(dist, "css", "dossier.css"), "utf8");
  const index = await readFile(join(dist, "examples", "index.html"), "utf8");
  assert.match(index, /showcase\/index\.html/);
  assert.match(index, /notification-routing\/index\.html/);
});

test("copied SVG assets stay valid XML", async () => {
  // SVG is XML, so a `<` inside <style> is parsed as markup and the whole file
  // fails to render, silently, as a broken image. That happened once.
  const svg = await readFile(join(dist, "examples", "showcase", "degrade.svg"), "utf8");
  const style = /<style>([\s\S]*?)<\/style>/.exec(svg);
  assert.ok(style, "the diagram carries its own styles");
  assert.doesNotMatch(style[1], /[<&]/, "no raw < or & inside an SVG <style> element");
  assert.match(svg, /prefers-color-scheme: dark/, "the diagram follows the reader's color scheme");
});
