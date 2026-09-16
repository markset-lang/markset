import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build, EXAMPLES } from "../build.ts";

/**
 * Build once, into a temporary directory. Tests used to build into dist/ three
 * times over, which races anything else touching it: a dev server rebuilding,
 * a browser reading it, another test run.
 */
const dist = await mkdtemp(join(tmpdir(), "markset-site-"));
const pages = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

test("the site builds, every page has the shell, and links stay relative", async () => {
  assert.ok(pages.includes("index.html"));
  assert.ok(pages.includes("spec/index.html"));
  assert.ok(pages.includes("reference/card/index.html"));
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

test("two builds into one directory both finish, and the tree is whole", async () => {
  // `npm run site` while site:watch is rebuilding. With a fixed staging path
  // each build deleted the directory the other was writing into, and the tree
  // that got published was whatever survived — which looks exactly like a page
  // whose stylesheet disappeared. Every build gets its own scratch space now,
  // so the loser of the race publishes a complete tree rather than a ruin.
  // Which interleaving happens varies, so this runs four at once rather than two.
  const shared = await mkdtemp(join(tmpdir(), "markset-race-"));
  try {
    await Promise.all([build(shared), build(shared), build(shared), build(shared)]);
    for (const file of [
      "index.html",
      join("css", "markset.css"),
      join("css", "site.css"),
      join("spec", "index.html"),
    ]) {
      const text = await readFile(join(shared, file), "utf8");
      assert.ok(text.length > 0, `${file} is empty after concurrent builds`);
    }
    const leftovers = (await readdir(resolve(shared, ".."))).filter((f) => f.startsWith(`${basename(shared)}.`));
    assert.deepEqual(leftovers, [], "scratch directories are cleaned up");
  } finally {
    await rm(shared, { recursive: true, force: true });
  }
});

test("every document under examples/ is published, and every published one exists", async () => {
  // Both directions matter. A document in the directory that no entry names is
  // one nobody decided to publish, and that is how private material gets into a
  // public repository; an entry naming a file that is not there is a dead page.
  const dir = resolve(import.meta.dirname, "..", "..", "examples");
  const onDisk = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const listed = EXAMPLES.map((e) => e.file).sort();
  assert.deepEqual(onDisk, listed, "examples/ and EXAMPLES in site/build.ts must match exactly");
});

test("the reader can choose a color scheme, and no page gained a script for it", async () => {
  // The no-script property is the constraint, not an accident: it is what lets
  // the same page render safely anywhere, and the home page says so. The test
  // above already asserts no page contains a script; this one asserts the
  // control that would most obviously have needed one does not have it.
  const home = await readFile(join(dist, "index.html"), "utf8");
  assert.match(home, /<div class="site-scheme" role="group" aria-label="Color scheme">/);
  assert.match(
    home,
    /id="ms-scheme-auto" class="site-scheme-input" checked/,
    "auto is the default, so a reader who ignores it keeps their system preference",
  );
  assert.match(home, /id="ms-scheme-light"/);
  assert.match(home, /id="ms-scheme-dark"/);
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  assert.match(css, /body:has\(#ms-scheme-light:checked\) \{ color-scheme: light; \}/);
  assert.match(css, /body:has\(#ms-scheme-dark:checked\) \{ color-scheme: dark; \}/);
});

test("the section divider is spaced the same above and below", async () => {
  // With a top margin alone the rule sat three units below the section it
  // closed and one above the next, and read as symmetric only because an
  // eyebrow follows almost every rule here and brings a matching top margin of
  // its own. The colophon is the one place nothing does, and that is where it
  // showed. margin-block keeps it true whatever follows.
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  const rule = /\.ms-document > hr\.tick \{[^}]*\}/.exec(css);
  assert.ok(rule, "the divider rule exists");
  assert.match(rule[0], /margin-block: calc\(var\(--ms-space\) \* 3\);/);
  assert.doesNotMatch(rule[0], /margin-top:/, "a top margin alone makes it depend on what follows");
});

test("the app bar sticks, and everything that has to clear it uses one token", async () => {
  // Three rules depend on the bar's height: the bar reserves it, the sticky
  // table of contents starts below it, and an anchored heading scrolls clear of
  // it. If one of them stops reading --site-header-h they drift apart silently.
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  assert.match(css, /--site-header-h:/, "the bar's height is a token");
  assert.match(css, /\.site-header \{[^}]*position: sticky;[^}]*top: 0;/, "the app bar is sticky");
  assert.match(css, /\.site-header \{[^}]*min-height: var\(--site-header-h\)/);
  assert.match(css, /\.site-toc \{[^}]*top: var\(--site-header-h\)/, "the TOC starts below the bar");
  assert.match(css, /scroll-margin-top: calc\(var\(--site-header-h\)/, "anchors clear the bar");
  assert.match(css, /@media print \{\s*\.site-header \{ position: static/, "a printed page has no sticky bar");
});

test("every link to the repository matches package.json, which matches the remote", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    repository: { url: string };
    homepage: string;
  };
  const repo = pkg.repository.url.replace(/\.git$/, "");
  assert.match(repo, /^https:\/\/github\.com\/[^/]+\/[^/]+$/, "repository.url must be a GitHub project URL");

  for (const page of pages) {
    const html = await readFile(join(dist, page), "utf8");
    for (const url of html.match(/https:\/\/github\.com\/[^"< ]+/g) ?? []) {
      assert.ok(url.startsWith(repo), `${page} links ${url}, not ${repo}`);
    }
  }
  // The README is not built, so it is checked directly.
  const readme = await readFile(join(root, "README.md"), "utf8");
  for (const url of readme.match(/https:\/\/[a-z0-9-]+\.github\.io\/[^\s>)]+/g) ?? []) {
    assert.ok(pkg.homepage.startsWith(url) || url.startsWith(pkg.homepage), `README links ${url}, not ${pkg.homepage}`);
  }
  for (const url of readme.match(/https:\/\/github\.com\/[^\s>)]+/g) ?? []) {
    assert.ok(url.startsWith(repo), `README links ${url}, not ${repo}`);
  }
});

test("the icon controls in the app bar still say what they are", async () => {
  // Home and GitHub are icons now. An icon with no text is a control a screen
  // reader announces as "link", so each keeps its word in the accessibility
  // tree, and the SVG itself is hidden from it.
  const home = await readFile(join(dist, "index.html"), "utf8");
  for (const name of ["Home", "GitHub", "Auto", "Light", "Dark"]) {
    assert.match(home, new RegExp(`<span class="site-visually-hidden">${name}</span>`), `${name} has a name`);
  }
  assert.match(home, /<svg class="site-icon"[^>]*aria-hidden="true"/, "the icons are decorative");
  assert.equal(
    [...home.matchAll(/<svg class="site-icon"(?![^>]*aria-hidden)/gu)].length,
    0,
    "every bar icon is hidden from assistive technology",
  );
});

test("the scheme control shows one option until it is asked for, and does not move the bar", async () => {
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  assert.match(css, /\.site-scheme-option \{[^}]*display: none/u, "options are hidden by default");
  // Three ways it opens: the one in force is always shown, and hover or focus
  // reveals the rest. Focus is what makes it reachable by keyboard and by tap.
  const opens =
    /\.site-scheme-input:checked \+ \.site-scheme-option,\s*\.site-scheme:hover \.site-scheme-option,\s*\.site-scheme:focus-within \.site-scheme-option \{[^}]*display: inline-flex/u;
  assert.match(css, opens, "checked, hover and focus-within all reveal options");
  // The slot reserves the open width. Without it the nav slides sideways every
  // time a pointer crosses the control.
  assert.match(css, /\.site-scheme-slot \{[^}]*width: var\(--site-scheme-w\)/u);
  assert.match(css, /--site-scheme-w:/u, "and the width is a token, like the bar's height");
});

test("a visually hidden label cannot escape its container", async () => {
  // It used to be position: absolute, and inside the horizontally scrolling
  // nav on a phone it resolved against the sticky header rather than its link,
  // landing past the viewport and pushing every page sideways.
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  const rule = /\.site-visually-hidden \{([^}]*)\}/u.exec(css);
  assert.ok(rule, "the utility exists");
  assert.doesNotMatch(rule[1], /position:\s*absolute/u, "in flow, so it has nowhere to escape to");
  assert.match(rule[1], /clip-path: inset\(50%\)/u);
});
