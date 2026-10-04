import { after, test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, normalize, resolve } from "node:path";
import { build, EXAMPLES, GALLERY } from "../build.ts";
import { SCHEMES, sourceHash, THUMBNAILS } from "../thumbnails.ts";

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
    assert.match(html, /<nav class="site-nav" aria-label="Main">/, page);
    assert.doesNotMatch(html, /href="\//, `${page} has a root-relative link`);
    // The shell's scheme-persistence script, and on the playground the module
    // that runs the renderer. Nothing else, and on no page anything inside the
    // document -- which is the half that is a claim rather than a budget: a
    // rendered Markset document carries no script. The playground is named
    // rather than allowed by a pattern, so a second application page is a
    // decision somebody makes here instead of one that arrives by accident.
    // "Editing visually" is the second, decided 2026-09-28: a page about an
    // editor that shows no editor asks the reader to take its word for it.
    const allowed = page === "playground/index.html" || page === "tiptap/index.html" ? 2 : 1;
    const scripts = html.match(/<script/g) ?? [];
    assert.equal(scripts.length, allowed, `${page} has ${scripts.length} scripts, expected ${allowed}`);
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    assert.doesNotMatch(main, /<script/, `${page} renders a script inside the document`);
  }
  const spec = await readFile(join(dist, "spec", "index.html"), "utf8");
  assert.match(spec, /<aside class="site-toc">/);
  assert.match(spec, /<h2 id="2-grammar">/);
  const home = await readFile(join(dist, "index.html"), "utf8");
  assert.match(home, /<div class="ms-metrics">/, "home renders a live metrics block");
  assert.match(home, /<p class="lead">/, "attribute line applied on the home page");
});

test("every link the site writes resolves to a page it built", async () => {
  // A page's links are written relative to where the page is authored, and are
  // served from where it is built. start.md and cli.md are one directory deep
  // and had linked as if they sat at the root, so every cross-page link on the
  // adoption page 404'd — the one page a new reader is most likely to be on.
  //
  // Rendered conformance cases are excluded. Their content is example markup,
  // and it points at files like a.svg on purpose: the case is about the syntax,
  // not about the image resolving. Code is excluded for the same reason — a
  // fragment of HTML shown as an example is not a link the site is making.
  const broken: string[] = [];
  for (const page of pages) {
    const html = withoutExamples(await readFile(join(dist, page), "utf8"));
    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|data:|#)/.test(href)) continue;
      const target = normalize(join(dirname(page), href.split("#")[0]));
      await access(join(dist, target)).catch(() => broken.push(`${page} -> ${href}`));
    }
  }
  assert.deepEqual(broken, [], `broken links:\n${broken.join("\n")}`);
});

/**
 * Strip rendered case previews and code from a page, leaving the links the site
 * is making on its own behalf. Depth is counted rather than matched by regex,
 * because a preview contains constructs and those are divs too.
 */
function withoutExamples(html: string): string {
  const open = /<div class="site-preview">/g;
  let out = "";
  let at = 0;
  for (;;) {
    open.lastIndex = at;
    const start = open.exec(html);
    if (!start) {
      out += html.slice(at);
      break;
    }
    out += html.slice(at, start.index);
    const tag = /<\/?div\b/g;
    let depth = 1;
    let i = start.index + start[0].length;
    while (depth > 0) {
      tag.lastIndex = i;
      const next = tag.exec(html);
      if (!next) return out;
      depth += next[0] === "</div" ? -1 : 1;
      i = next.index + next[0].length;
    }
    at = i;
  }
  return out.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<code[\s\S]*?<\/code>/g, "");
}

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

test("every image an example links to is published beside its page", async () => {
  // The site copies an example's images separately from the document, so a
  // missing copy is a broken picture on a page that builds without complaint.
  for (const example of EXAMPLES) {
    const page = join("examples", example.slug, "index.html");
    const html = await readFile(join(dist, page), "utf8");
    for (const [, src] of html.matchAll(/<img [^>]*src="([^"]+)"/g)) {
      if (/^(data:|https?:)/.test(src)) continue;
      await access(join(dist, dirname(page), src)).catch(() => assert.fail(`${page} links ${src}, which is not there`));
    }
  }
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
  // `pnpm run site` while site:watch is rebuilding. With a fixed staging path
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

test("every example in the gallery has a thumbnail in each scheme, taken from what it is now", async () => {
  // The thumbnails are committed rather than taken at build time (site/thumbnails.ts says why), so the two
  // ways they go wrong are checked here: a picture missing or left behind, and a picture of an example that
  // has changed since. The fix for either is `pnpm run site:thumbnails`.
  const manifest = JSON.parse(await readFile(join(THUMBNAILS, "manifest.json"), "utf8")) as Record<string, string>;
  const expected = GALLERY.flatMap((e) => SCHEMES.map((scheme) => `${e.slug}.${scheme}.webp`)).sort();
  const onDisk = (await readdir(THUMBNAILS)).filter((f) => f.endsWith(".webp")).sort();
  assert.deepEqual(onDisk, expected, "site/thumbnails/ must hold exactly the gallery's thumbnails");
  assert.deepEqual(Object.keys(manifest).sort(), GALLERY.map((e) => e.slug).sort());
  for (const example of GALLERY) {
    assert.equal(
      manifest[example.slug],
      await sourceHash(example),
      `${example.file} has changed since its thumbnails were taken: run pnpm run site:thumbnails`,
    );
  }
  const index = await readFile(join(dist, "examples", "index.html"), "utf8");
  for (const file of expected) {
    assert.match(index, new RegExp(`<img loading="lazy" src="thumbnails/${file.replace(/\./g, "\\.")}" alt="">`));
    await access(join(dist, "examples", "thumbnails", file));
  }
});

test("the reader can choose a color scheme, and it survives the next page", async () => {
  // The control is CSS; only carrying the choice across a page load is not, and
  // that is all the script does. So both halves are pinned here: the radios and
  // body:has() have to be the mechanism, and the script has to write the hook
  // markset.css already publishes rather than a second one of its own.
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
  // The script runs as the first thing in <body>, so nothing paints in the
  // wrong scheme, and it sets data-scheme, which markset.css already honors.
  assert.match(home, /<body[^>]*>\n<script>/, "the scheme script must run before anything paints");
  assert.match(home, /localStorage\.setItem\(key, value\)/, "the choice is stored");
  assert.match(home, /document\.body\.dataset\.scheme = value/, "and applied through the §6 hook");
  assert.ok(
    home.indexOf("</script>") < home.indexOf('<header class="site-header"'),
    "the script belongs to the shell, ahead of the chrome it restores",
  );
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
  // One value, so the space above and below is the same by construction.
  assert.match(rule[0], /margin-block: [^\s;]+;/, "margin-block with a single value");
  assert.doesNotMatch(rule[0], /margin-top:/, "a top margin alone makes it depend on what follows");
});

test("tab titles follow the family's pattern: the home page names Markset first, every other page last", async () => {
  // Streamlane's, and intentset.org's and coralreefventures.com's since
  // 2026-10-03, so the four sites read alike in a row of tabs.
  const home = await readFile(join(dist, "index.html"), "utf8");
  assert.match(home, /<title>Markset · Documents your agents write, and people want to read<\/title>/);
  for (const page of pages.filter((p) => p !== "index.html")) {
    const html = await readFile(join(dist, page), "utf8");
    assert.match(html, /<title>[^<]*[^.] · Markset<\/title>/, page);
  }
});

test("the header is held to the page's width and scrolls away, as on intentset.org", async () => {
  // It used to be a full-width sticky bar, the one header of the three sibling
  // sites that was. Now it shares the page's box, draws its rule inside the
  // gutters, and nothing has to clear it: the rail sticks to the top of the
  // viewport and an anchored heading needs only a little air.
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  const header = /\.site-header \{[^}]*\}/.exec(css)?.[0] ?? "";
  assert.doesNotMatch(header, /position: sticky/, "the header is not sticky");
  assert.match(
    css,
    /\.site-header, \.site-footer \{[^}]*max-width: 75rem;[^}]*margin-inline: auto;/,
    "held to the page's width",
  );
  assert.match(header, /calc\(100% - 2 \* var\(--site-gutter\)\) 1px/, "its rule starts at the content's edge");
  assert.match(css, /\.site-toc \{[^}]*position: sticky; top: 0;/, "the rail sticks to the top");
  assert.doesNotMatch(css, /--site-header-h/, "no height token is left for anything to clear");
});

test("the wordmark goes home, the bar names sections, and the repository is in the footer", async () => {
  const home = await readFile(join(dist, "index.html"), "utf8");
  const header = /<header class="site-header">[\s\S]*?<\/header>/.exec(home)?.[0] ?? "";
  assert.match(header, /<a class="site-brand" href="\.\/index\.html">/, "the wordmark links home");
  const nav = /<nav class="site-nav" aria-label="Main">([\s\S]*?)<\/nav>/.exec(header)?.[1] ?? "";
  const labels = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Start", "Tools", "Reference", "Examples", "Playground"]);
  assert.match(nav, /href="\.\/agents\/index\.html">Start</, "Start lands on writing with agents");
  assert.doesNotMatch(header, /github\.com/, "the repository is not in the header");
  const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(home)?.[0] ?? "";
  assert.match(footer, /<a href="https:\/\/github\.com\/[^"]+">Source on GitHub<\/a>/, "it is in the footer");
  assert.match(footer, /<svg class="site-family"[^>]*aria-hidden="true"/, "the family mark is decoration");
});

test("the built site carries the custom domain", async () => {
  // Pages serves whatever host the CNAME file at the root names. Without it the
  // domain lives only in a repository setting, and a deploy that writes the
  // setting from an artifact with no CNAME drops it -- which turns every link
  // on npm, in the README and in eight package manifests into a 404 at once.
  const root = resolve(import.meta.dirname, "..", "..");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { homepage: string };
  const cname = await readFile(join(dist, "CNAME"), "utf8");
  assert.equal(cname.trim(), new URL(pkg.homepage).host);
});

test("every link to the repository matches package.json, which matches the remote", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    repository: { url: string };
    homepage: string;
  };
  // Same normalization the generator does: npm wants the canonical git+ prefix on repository.url.
  const repo = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  assert.match(repo, /^https:\/\/github\.com\/[^/]+\/[^/]+$/, "repository.url must be a GitHub project URL");

  for (const page of pages) {
    const html = await readFile(join(dist, page), "utf8");
    for (const url of html.match(/https:\/\/github\.com\/[^"< ]+/g) ?? []) {
      assert.ok(url.startsWith(repo), `${page} links ${url}, not ${repo}`);
    }
  }
  // The README is not built, so it is checked directly. Match by host rather
  // than by a github.io shape: the site moved to its own domain, and a pattern
  // that only recognized the old host would have gone quiet instead of failing.
  const home = new URL(pkg.homepage);
  const readme = await readFile(join(root, "README.md"), "utf8");
  const siteLinks = readme.match(/https:\/\/[a-z0-9.-]+\.(?:org|io|com|dev)\/[^\s>)]*/g) ?? [];
  for (const url of siteLinks) {
    const host = new URL(url).host;
    if (host === "github.com" || host !== home.host) continue;
    assert.ok(url.startsWith(pkg.homepage), `README links ${url}, not ${pkg.homepage}`);
  }
  assert.ok(
    siteLinks.some((url) => new URL(url).host === home.host),
    `the README must link the site at ${home.host}, or this check guards nothing`,
  );
  for (const url of readme.match(/https:\/\/github\.com\/[^\s>)]+/g) ?? []) {
    assert.ok(url.startsWith(repo), `README links ${url}, not ${repo}`);
  }
});

test("the icon controls in the header still say what they are", async () => {
  // The scheme options are icons. An icon with no text is a control a screen
  // reader announces as "radio button", so each keeps its word in the
  // accessibility tree, and the SVG itself is hidden from it.
  const home = await readFile(join(dist, "index.html"), "utf8");
  for (const name of ["Auto", "Light", "Dark"]) {
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
  // nav the header had on a phone it resolved against the header rather than
  // its link, landing past the viewport and pushing every page sideways.
  const css = await readFile(join(dist, "css", "site.css"), "utf8");
  const rule = /\.site-visually-hidden \{([^}]*)\}/u.exec(css);
  assert.ok(rule, "the utility exists");
  assert.doesNotMatch(rule[1], /position:\s*absolute/u, "in flow, so it has nowhere to escape to");
  assert.match(rule[1], /clip-path: inset\(50%\)/u);
});

test("every page carries the mark: a favicon link, and the image beside the wordmark", async () => {
  // One SVG is the favicon, the header mark and the source of the extension's
  // icon.png, so it is copied to the root of the output and every page links it
  // by a relative path that survives the site being served from a subpath.
  const icon = await readFile(join(dist, "icon.svg"), "utf8");
  assert.match(icon, /^<svg /u);
  for (const page of ["index.html", join("spec", "index.html"), join("examples", "showcase", "index.html")]) {
    const html = await readFile(join(dist, page), "utf8");
    // The shell writes ./ for the root page and ../ per level below it.
    const rel = page.split("/").length === 1 ? "./" : "../".repeat(page.split("/").length - 1);
    assert.ok(
      html.includes(`<link rel="icon" type="image/svg+xml" href="${rel}icon.svg">`),
      `${page} links the favicon`,
    );
    assert.ok(
      html.includes(`<img class="site-mark" src="${rel}icon.svg" alt=""`),
      `${page} shows the mark in the header`,
    );
  }
});
