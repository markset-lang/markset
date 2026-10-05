/**
 * The shell's baseline, which intentset.org had and this site did not until
 * 2026-10-05: a skip link and a focusable main for the keyboard, a description,
 * canonical and Open Graph block for search results and link previews, a
 * sitemap and robots.txt for crawlers, a 404 page for addresses Pages has
 * nothing at. The two sites are
 * read side by side as one family, and this is the part of that a keyboard
 * user, a link preview or a crawler meets first.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { build, canonicalUrl, pageDescription, SIBLING } from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { homepage: string; version: string };
const dist = await mkdtemp(join(tmpdir(), "markset-shell-"));
const pages = await build(dist);
const html = new Map<string, string>();
for (const page of pages) html.set(page, await readFile(join(dist, page), "utf8"));
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

const attr = (doc: string, pattern: RegExp): string | undefined => pattern.exec(doc)?.[1];

test("every page opens with a skip link to a main the keyboard can land on", () => {
  for (const [page, doc] of html) {
    const body = doc.slice(doc.indexOf("<body"));
    const firstLink = /<a [^>]*>[^<]*<\/a>/.exec(body)?.[0];
    assert.equal(firstLink, '<a class="site-skip" href="#main">Skip to content</a>', `${page}: the first link`);
    assert.ok(body.indexOf("site-skip") < body.indexOf('<header class="site-header">'), `${page}: ahead of the bar`);
    assert.equal((doc.match(/<main\b/g) ?? []).length, 1, `${page}: one main`);
    assert.equal((doc.match(/\bid="main"/g) ?? []).length, 1, `${page}: no heading takes main's id`);
    assert.match(doc, /<main id="main" class="ms-document" tabindex="-1">/, page);
  }
});

test("the focus ring is one rule, always visible, and main does not draw one", async () => {
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  assert.match(css, /^:focus-visible \{ outline: 3px solid var\(--site-focus\);/m);
  assert.match(css, /--site-focus: light-dark\(/, "the ring has a color in each scheme");
  assert.match(css, /^main:focus \{ outline: none; \}/m);
  assert.match(css, /\.site-skip:focus \{ top: 0\.75rem; \}/, "the skip link drops in on focus");
  const suppressed = css.split("\n").filter((line) => /outline: (none|0)/.test(line) && !line.startsWith("main:focus"));
  assert.deepEqual(suppressed, [], "nothing else takes the ring away");
});

test("every page describes itself, and says where it lives, for search results and link previews", () => {
  const descriptions = new Map<string, string>();
  for (const [page, doc] of html) {
    const description = attr(doc, /<meta name="description" content="([^"]*)">/);
    assert.ok(description && description.length >= 20, `${page}: a description`);
    const text = description.replace(/&(quot|amp|lt|gt);/g, "_");
    assert.ok(text.length <= 200, `${page}: a description short enough to show whole`);
    assert.doesNotMatch(description, /<|\{\{/, `${page}: text, not markup or a token`);
    if (page === "404.html") continue;
    descriptions.set(page, description);
    const canonical = canonicalUrl(page);
    assert.ok(canonical.startsWith(pkg.homepage), `${page}: on the site's own host`);
    assert.doesNotMatch(canonical, /index\.html$/, `${page}: the address a reader types`);
    assert.equal(attr(doc, /<link rel="canonical" href="([^"]+)">/), canonical, `${page}: canonical`);
    assert.equal(attr(doc, /<meta property="og:url" content="([^"]+)">/), canonical, `${page}: og:url`);
    assert.equal(attr(doc, /<meta property="og:description" content="([^"]*)">/), description, page);
    assert.equal(
      attr(doc, /<meta property="og:title" content="([^"]*)">/),
      attr(doc, /<title>([^<]*)<\/title>/),
      `${page}: og:title is the tab title`,
    );
    assert.match(doc, /<meta property="og:type" content="website">/, page);
    assert.match(doc, /<meta property="og:site_name" content="Markset">/, page);
    assert.match(doc, /<meta name="twitter:card" content="summary">/, page);
  }
  assert.equal(canonicalUrl("index.html"), pkg.homepage);
  assert.equal(canonicalUrl("reference/card/index.html"), new URL("reference/card/", pkg.homepage).href);
  // A page's description is its own first paragraph, so two pages sharing one
  // means one of them fell back to the default or has nothing of its own to say.
  const seen = new Map<string, string>();
  for (const [page, description] of descriptions) {
    assert.ok(!seen.has(description), `${page} and ${seen.get(description)} share a description`);
    seen.set(description, page);
  }
});

test("a description is the first paragraph after the h1, as plain text, held to a search result's length", () => {
  const home = html.get("index.html") ?? "";
  assert.match(
    attr(home, /<meta name="description" content="([^"]*)">/) ?? "",
    /^Agents draft most documents now, and they already write Markdown\./,
    "the home page's lead",
  );
  assert.equal(
    pageDescription({ body: "<p>before</p><h1>T</h1><p>The <code>card</code> &#x26; its <a href=x>title</a>.</p>" }),
    "The card & its title.",
  );
  assert.equal(pageDescription({ body: "<h1>T</h1>", description: "Given." }), "Given.");
  const long = pageDescription({ body: `<h1>T</h1><p>${"word ".repeat(80)}</p>` });
  assert.ok(long.length <= 200 && long.endsWith("word…"), long);
});

test("the sitemap lists every page at its canonical address, and robots.txt points at it", async () => {
  const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
  assert.match(
    sitemap,
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
  );
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = pages.filter((p) => p !== "404.html").map(canonicalUrl);
  assert.deepEqual(listed, expected);
  assert.equal(new Set(listed).size, listed.length, "no address twice");
  const robots = await readFile(join(dist, "robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.match(robots, new RegExp(`^Sitemap: ${new URL("sitemap.xml", pkg.homepage).href}$`, "m"));
});

test("the 404 page sits at the root, writes its links from the site's root path, and asks not to be indexed", async () => {
  assert.ok(pages.includes("404.html"), "Pages serves 404.html from the root for any missing address");
  const doc = html.get("404.html") ?? "";
  const sitePath = new URL(pkg.homepage).pathname;
  // No base: it would resolve the skip link's #main against the root too, and
  // send a keyboard user on the 404 page to the home page.
  assert.doesNotMatch(doc, /<base\b/, "no base");
  assert.match(doc, /<a class="site-skip" href="#main">/, "the skip link stays on the page");
  assert.match(doc, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(doc, /rel="canonical"|og:url/, "a missing address has no canonical one");
  assert.match(doc, /<h1[^>]*>Page not found<\/h1>/);
  // Every other link is written from the site's root path, so it resolves the
  // same at any depth Pages serves the page.
  for (const [, href] of doc.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|#)/.test(href)) continue;
    assert.ok(href.startsWith(sitePath), `${href} is not written from ${sitePath}`);
    const path = href.slice(sitePath.length).split("#")[0] || "index.html";
    await access(join(dist, normalize(path))).catch(() => assert.fail(`404.html -> ${href}`));
  }
});

test("the home page badges the release from package.json", () => {
  const home = html.get("index.html") ?? "";
  assert.ok(home.includes(`<span class="ms-span badge">${pkg.version}</span>`), `the badge reads ${pkg.version}`);
});

test("the footer links the sibling site, and the format's own pages do not mention it", () => {
  for (const [page, doc] of html) {
    const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(doc)?.[0] ?? "";
    assert.ok(footer.includes(`<a href="${SIBLING.url}">${SIBLING.name}</a>`), `${page}: the footer links it`);
    const main = doc.slice(doc.indexOf("<main"), doc.indexOf("</main>"));
    assert.ok(!main.includes(new URL(SIBLING.url).host), `${page}: Markset stays a neutral format`);
  }
});

test("every relative link on a page that is not at the root resolves from where the page is", async () => {
  // Only the 404 page writes its links from the site's root; everywhere else a
  // link resolves from the page's own directory, which is what lets the site
  // work at any base path. This is the guard that the root did not leak into
  // the shell.
  for (const [page, doc] of html) {
    if (page === "404.html") continue;
    assert.doesNotMatch(doc, /<base\b/, `${page} has a base`);
    const icon = attr(doc, /<link rel="icon" type="image\/svg\+xml" href="([^"]+)">/) ?? "";
    await access(join(dist, normalize(join(dirname(page), icon))));
  }
});
