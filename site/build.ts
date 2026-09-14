/**
 * Static site generator for markset.dev-style docs. Every page is Markset
 * rendered by the packages in this repo; the guide and conformance pages are
 * generated from tests/*.json so they cannot drift from the suite.
 *
 * Output: dist/ with relative links, so it works at any base path
 * (GitHub Pages project sites live under /<repo>/).
 */
import { mkdir, readdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Heading, Root } from "mdast";
import { parseDocument, renderDowngrade, renderHtml, bodyAttributes, defaultStylesheetPath, type Diagnostic } from "./deps.ts";

const root = resolve(import.meta.dirname, "..");
/** Output directory. `build()` may be pointed elsewhere, which is how tests avoid racing dist/ against a dev server. */
let out = join(root, "dist");
/** Repository and site URLs come from package.json so they cannot drift from the remote. */
const pkg = JSON.parse(await readFile(join(resolve(import.meta.dirname, ".."), "package.json"), "utf8")) as { repository: { url: string } };
const REPO = pkg.repository.url.replace(/\.git$/, "");

interface Page {
  /** Output path relative to dist/, e.g. "guide/card/index.html". */
  path: string;
  title: string;
  /** Rendered <main> content. */
  body: string;
  /** Optional table of contents HTML. */
  toc?: string;
  themeAttributes?: string;
  /** Extra stylesheet for this page, as a path inside dist/ (spec §6 theme stylesheets). */
  themeCss?: string;
}

interface ConformanceCase {
  section: string; name?: string; markset: string; html?: string; downgrade?: string; ast?: unknown; valid: boolean; diagnostics?: string[];
}

const NAV: Array<[string, string]> = [["Home", "index.html"], ["Guide", "guide/index.html"], ["Spec", "spec/index.html"], ["Conformance", "conformance/index.html"], ["Examples", "examples/index.html"]];

/** Documents rendered as their own pages, with the theme stylesheet each one is meant to be read with (spec §6). */
const EXAMPLES: Array<{ slug: string; file: string; title: string; theme?: string; blurb: string }> = [
  { slug: "showcase", file: "showcase.md", title: "Showcase", blurb: "Every v0 construct once, at the length of a real document. It declares no theme stylesheet, so it shows what the vocabulary looks like on whatever stylesheet renders it." },
  { slug: "notification-routing", file: "notification-routing.md", title: "Analysis document", theme: "dossier.css", blurb: "A long analysis document with a theme stylesheet: status chips, a layer rail, a tinted pipeline stage, lettered steps. The system it describes is invented." },
];

const CONSTRUCTS = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const;
const SECTION_ORDER = ["attribute-specifier", "bracketed-span", "block-directive", "separator-directive", "attribute-line", ...CONSTRUCTS, "frontmatter"];

export async function build(outDir: string = join(root, "dist")): Promise<string[]> {
  out = outDir;
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "css"), { recursive: true });
  await cp(defaultStylesheetPath, join(out, "css", "markset.css"));
  await cp(join(root, "site", "site.css"), join(out, "css", "site.css"));
  await mkdir(join(out, "examples", "showcase"), { recursive: true });
  await cp(join(root, "examples", "degrade.svg"), join(out, "examples", "showcase", "degrade.svg"));
  for (const example of EXAMPLES) {
    if (example.theme) await cp(join(root, "examples", example.theme), join(out, "css", example.theme));
  }

  const cases = await loadCases();
  const pages: Page[] = [
    await markdownPage("index.html", join(root, "site", "content", "index.md")),
    await specPage(),
    await guideIndex(),
    ...(await Promise.all(CONSTRUCTS.map((name) => guidePage(name, cases[name] ?? [])))),
    conformanceIndex(cases),
    ...SECTION_ORDER.filter((s) => cases[s]).map((s) => conformancePage(s, cases[s])),
    await examplesIndex(),
    ...(await Promise.all(EXAMPLES.map(examplePage))),
  ];

  const written: string[] = [];
  for (const page of pages) {
    const file = join(out, page.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, shell(page));
    written.push(page.path);
  }
  return written;
}

// ---------------------------------------------------------------------------

async function markdownPage(path: string, file: string, themeCss?: string | false): Promise<Page> {
  const source = await readFile(file, "utf8");
  const { ast, diagnostics } = parseDocument(source);
  failOnErrors(diagnostics, file);
  addHeadingIds(ast);
  return {
    path,
    title: firstHeading(ast) ?? basename(file, ".md"),
    body: renderHtml(ast),
    themeAttributes: bodyAttributes(ast.frontmatter ?? null),
    ...(themeCss ? { themeCss } : {}),
  };
}

/** One example document, with links to the index and to the other examples so no page is a dead end. */
async function examplePage(example: (typeof EXAMPLES)[number]): Promise<Page> {
  const page = await markdownPage(`examples/${example.slug}/index.html`, join(root, "examples", example.file), example.theme && `css/${example.theme}`);
  const others = EXAMPLES.filter((e) => e.slug !== example.slug)
    .map((e) => `<a href="../${e.slug}/index.html">${esc(e.title)}</a>`);
  const source = `<a href="${REPO}/blob/main/examples/${esc(example.file)}">source</a>`;
  page.body += `<p class="site-more">Examples: <a href="../index.html">all</a>${others.length ? " · " + others.join(" · ") : ""} · ${source}</p>\n`;
  return page;
}

async function examplesIndex(): Promise<Page> {
  const intro = await readFile(join(root, "site", "content", "examples", "index.md"), "utf8");
  const { ast, diagnostics } = parseDocument(intro);
  failOnErrors(diagnostics, "examples/index.md");
  const list = EXAMPLES.map((e) => {
    const theme = e.theme ? ` Rendered with <code>--theme examples/${esc(e.theme)}</code>.` : "";
    return `<li><a href="${e.slug}/index.html">${esc(e.title)}</a> — ${esc(e.blurb)}${theme} <a href="${REPO}/blob/main/examples/${esc(e.file)}"><code>examples/${esc(e.file)}</code></a></li>`;
  }).join("\n");
  return { path: "examples/index.html", title: "Examples", body: renderHtml(ast) + `<ul class="site-list">\n${list}\n</ul>\n` };
}

async function specPage(): Promise<Page> {
  const file = join(root, "spec", "v0.md");
  const { ast, diagnostics } = parseDocument(await readFile(file, "utf8"));
  failOnErrors(diagnostics, file);
  addHeadingIds(ast);
  const toc = tableOfContents(ast, 2, 3);
  const meta = ast.children[0]?.type === "yaml" ? ast.children[0].value : "";
  const status = /status:\s*(.+)/.exec(meta)?.[1] ?? "";
  const version = /version:\s*(.+)/.exec(meta)?.[1] ?? "";
  const banner = `<p class="site-status"><span class="ms-span badge info">${esc(status)}</span> <span class="ms-span badge">${esc(version)}</span> Source: <a href="${REPO}/blob/main/spec/v0.md"><code>spec/v0.md</code></a></p>\n`;
  return { path: "spec/index.html", title: "Markset v0 specification", body: banner + renderHtml(ast), toc };
}

async function guideIndex(): Promise<Page> {
  const intro = await readFile(join(root, "site", "content", "guide", "index.md"), "utf8");
  const { ast, diagnostics } = parseDocument(intro);
  failOnErrors(diagnostics, "guide/index.md");
  const list = CONSTRUCTS.map((name) => `<li><a href="${name}/index.html"><code>${name}</code></a> — ${esc(BLURB[name])}</li>`).join("\n");
  return { path: "guide/index.html", title: "Guide", body: renderHtml(ast) + `<ul class="site-list">\n${list}\n</ul>\n` };
}

const BLURB: Record<(typeof CONSTRUCTS)[number], string> = {
  callout: "GitHub-style alerts with optional title and fold.",
  card: "A titled surface around any content.",
  grid: "A list whose items become cards.",
  columns: "Side-by-side regions with an optional ratio.",
  tabs: "Headings become tab labels; no JavaScript.",
  steps: "A numbered procedure from an ordered list.",
  metrics: "Big numbers with deltas from a table.",
  figure: "An image, table, or code block with a caption.",
};

async function guidePage(name: (typeof CONSTRUCTS)[number], sectionCases: ConformanceCase[]): Promise<Page> {
  const file = join(root, "site", "content", "guide", `${name}.md`);
  const { ast, diagnostics } = parseDocument(await readFile(file, "utf8"));
  failOnErrors(diagnostics, file);
  addHeadingIds(ast);
  const canonical = sectionCases.find((c) => c.name === "canonical") ?? sectionCases[0];
  const invalid = sectionCases.filter((c) => !c.valid).slice(0, 3);
  let body = renderHtml(ast);
  if (canonical) body += `<h2 id="example">Example</h2>\n${caseCard(canonical, { showName: false })}`;
  if (invalid.length) {
    body += `<h2 id="diagnostics">What the validator catches</h2>\n<p>Every error below is specified; nothing degrades silently.</p>\n`;
    body += invalid.map((c) => caseCard(c, { showName: true, compact: true })).join("\n");
  }
  body += `<p class="site-more">All ${sectionCases.length} cases for <code>${name}</code> are in the <a href="../../conformance/${name}/index.html">conformance browser</a>. The normative text is <a href="../../spec/index.html#4-core-constructs">spec §4</a>.</p>\n`;
  return { path: `guide/${name}/index.html`, title: `${name} — Guide`, body };
}

function conformanceIndex(cases: Record<string, ConformanceCase[]>): Page {
  const total = Object.values(cases).reduce((n, list) => n + list.length, 0);
  const rows = SECTION_ORDER.filter((s) => cases[s]).map((s) => {
    const list = cases[s];
    const invalid = list.filter((c) => !c.valid).length;
    return `<tr><td><a href="${s}/index.html"><code>${s}</code></a></td><td>${list.length}</td><td>${list.length - invalid}</td><td>${invalid}</td></tr>`;
  }).join("\n");
  const body = `<h1 id="conformance-suite">Conformance suite</h1>
<p>${total} cases in ${Object.keys(cases).length} sections, one JSON file per spec section under <a href="${REPO}/tree/main/tests"><code>tests/</code></a>. Each case pins the parse result, the diagnostics, and the two fallbacks. The pages below render every case live with the reference implementation: what you see in the "Rendered" column is produced at build time from the case's source, not copied from the file.</p>
<p>Structure (validity, diagnostic codes, AST) is normative for every implementation. The HTML and downgrade strings are reference output; other implementations must be equivalent, not byte-identical. See <a href="../spec/index.html#7-conformance-suite">spec §7</a>.</p>
<table class="site-table"><thead><tr><th>Section</th><th>Cases</th><th>Valid</th><th>Invalid</th></tr></thead><tbody>
${rows}
</tbody></table>
`;
  return { path: "conformance/index.html", title: "Conformance suite", body };
}

function conformancePage(section: string, list: ConformanceCase[]): Page {
  const body = `<h1 id="${section}">${esc(section)}</h1>
<p>${list.length} cases. Source: <a href="${REPO}/blob/main/tests/${section}.json"><code>tests/${section}.json</code></a>.</p>
${list.map((c, i) => caseCard(c, { showName: true, index: i + 1 })).join("\n")}`;
  return { path: `conformance/${section}/index.html`, title: `${section} — Conformance`, body };
}

/** One case: source, live rendering (when a document), downgrade, diagnostics. */
function caseCard(c: ConformanceCase, options: { showName: boolean; index?: number; compact?: boolean }): string {
  const isDocument = c.section === "frontmatter" || c.section === "bracketed-span" || c.section === "attribute-line"
    || (CONSTRUCTS as readonly string[]).includes(c.section) || c.markset.includes("\n");
  const label = options.showName ? `<h3 class="site-case-title">${options.index ? `<span class="site-case-index">#${options.index}</span> ` : ""}${esc(c.name ?? "case")}</h3>` : "";
  const badge = c.valid ? "" : ` <span class="ms-span badge danger">invalid</span>`;
  const diags = (c.diagnostics ?? []).length
    ? `<p class="site-diagnostics">Diagnostics: ${(c.diagnostics ?? []).map((d) => `<code>${esc(d)}</code>`).join(" ")}</p>`
    : "";
  let rendered = "";
  let downgrade = "";
  if (isDocument) {
    const { ast } = parseDocument(c.markset);
    rendered = `<div class="site-pane"><h4>Rendered</h4><div class="site-preview">\n${renderHtml(ast)}</div></div>`;
    if (!options.compact) downgrade = `<div class="site-pane"><h4>Downgrade</h4><pre><code>${esc(renderDowngrade(ast) || "(empty)")}</code></pre></div>`;
  } else {
    rendered = `<div class="site-pane"><h4>Parse result</h4><pre><code>${esc(JSON.stringify(c.ast, null, 2))}</code></pre></div>`;
  }
  return `<section class="site-case">
${label}${badge ? `<p>${badge}</p>` : ""}
<div class="site-panes">
<div class="site-pane"><h4>Source</h4><pre><code>${esc(c.markset || "(empty)")}</code></pre></div>
${rendered}
${downgrade}
</div>
${diags}
</section>`;
}

// ---------------------------------------------------------------------------

function shell(page: Page): string {
  const depth = page.path.split("/").length - 1;
  const rel = depth === 0 ? "./" : "../".repeat(depth);
  const nav = NAV.map(([label, href]) => {
    const active = page.path === href || (href !== "index.html" && page.path.startsWith(href.replace("index.html", "")));
    return `<a href="${rel}${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("\n");
  const attrs = page.themeAttributes || ' data-preset="technical"';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · Markset</title>
<link rel="stylesheet" href="${rel}css/markset.css">
<link rel="stylesheet" href="${rel}css/site.css">
${page.themeCss ? `<link rel="stylesheet" href="${rel}${page.themeCss}">\n` : ""}</head>
<body${attrs}>
<header class="site-header">
<a class="site-brand" href="${rel}index.html">Markset</a>
<nav class="site-nav">
${nav}
<a href="${REPO}">GitHub</a>
</nav>
</header>
<div class="site-layout${page.toc ? " has-toc" : ""}">
${page.toc ? `<aside class="site-toc"><nav aria-label="Contents">${page.toc}</nav></aside>\n` : ""}<main class="ms-document">
${page.body}</main>
</div>
<footer class="site-footer">Markset is a strict superset of CommonMark with a closed layout vocabulary. Every page on this site is written in Markset and built by the reference implementation.</footer>
</body>
</html>
`;
}

function tableOfContents(ast: Root, min: number, max: number): string {
  const items = ast.children.filter((n): n is Heading => n.type === "heading" && n.depth >= min && n.depth <= max);
  return `<ul>\n${items.map((h) => `<li class="toc-${h.depth}"><a href="#${h.attributes?.id ?? ""}">${esc(text(h))}</a></li>`).join("\n")}\n</ul>`;
}

/** Give every heading a stable slug id through the same attribute mechanism authors use (§2.5). */
function addHeadingIds(ast: Root): void {
  const seen = new Map<string, number>();
  for (const node of ast.children) {
    if (node.type !== "heading") continue;
    let slug = text(node).toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n + 1}`;
    if (!node.attributes) node.attributes = { type: "attributes", id: null, classes: [], attrs: {} };
    if (!node.attributes.id) node.attributes.id = slug;
  }
}

function text(node: { type?: string; value?: unknown; children?: unknown[] }): string {
  if (typeof node.value === "string" && node.type !== "html") return node.value;
  return (node.children ?? []).map((c) => text(c as { value?: unknown })).join("");
}

function firstHeading(ast: Root): string | null {
  const h = ast.children.find((n) => n.type === "heading" && n.depth === 1);
  return h ? text(h) : null;
}

async function loadCases(): Promise<Record<string, ConformanceCase[]>> {
  const dir = join(root, "tests");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const result: Record<string, ConformanceCase[]> = {};
  for (const file of files) result[basename(file, ".json")] = JSON.parse(await readFile(join(dir, file), "utf8"));
  return result;
}

function failOnErrors(diagnostics: Diagnostic[], file: string): void {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(`${relative(root, file)}: ${errors.map((d) => d.code).join(", ")}`);
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const written = await build();
  console.log(`site: ${written.length} pages written to ${relative(process.cwd(), out)}/`);
}
