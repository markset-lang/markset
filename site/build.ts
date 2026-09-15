/**
 * Static site generator for markset.dev-style docs. Every page is Markset
 * rendered by the packages in this repo; the reference and conformance pages are
 * generated from tests/*.json so they cannot drift from the suite.
 *
 * Output: dist/ with relative links, so it works at any base path
 * (GitHub Pages project sites live under /<repo>/).
 */
import { mkdir, readdir, readFile, rename, rm, writeFile, cp } from "node:fs/promises";
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
  /** Output path relative to dist/, e.g. "reference/card/index.html". */
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

const NAV: Array<[string, string]> = [["Home", "index.html"], ["Start", "start/index.html"], ["Reference", "reference/index.html"], ["CLI", "cli/index.html"], ["Spec", "spec/index.html"], ["Conformance", "conformance/index.html"], ["Examples", "examples/index.html"]];

/** Documents rendered as their own pages, with the theme stylesheet each one is meant to be read with (spec §6). */
/**
 * Every document under examples/ and the page it becomes. A test asserts this
 * list covers the directory exactly, in both directions: a document that is not
 * listed here is one nobody reviewed for publication, and a listing with no
 * document behind it is a dead page. An unlisted file rode along in a commit
 * once and had to be removed from history.
 */
export const EXAMPLES: Array<{ slug: string; file: string; title: string; theme?: string; toggles?: boolean; blurb: string }> = [
  { slug: "showcase", file: "showcase.md", title: "Showcase", toggles: true, blurb: "Every construct at the size it would really be used, each with a tab holding the source that produced it. It declares no theme stylesheet, so it shows the vocabulary on whatever stylesheet renders it." },
  { slug: "notification-routing", file: "notification-routing.md", title: "Analysis document", theme: "dossier.css", blurb: "A long analysis document with a theme stylesheet: status chips, a layer rail, a tinted pipeline stage, lettered steps. The system it describes is invented." },
  { slug: "strategy-read", file: "strategy-read.md", title: "Strategy memo", theme: "memo.css", blurb: "An argued memo in a newspaper register: a masthead, a captioned data table, marked sections in a two-lane grid, pull quotes and source citations. The company and every figure are invented." },
];

const CONSTRUCTS = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const;
const SECTION_ORDER = ["attribute-specifier", "bracketed-span", "block-directive", "separator-directive", "attribute-line", ...CONSTRUCTS, "frontmatter"];

/**
 * Build the whole site, then move it into place in one step.
 *
 * Writing into the output directory in place means a reader sees a half-built
 * site for as long as the build takes: the dev server serves from here while
 * rebuilding, and a crash used to leave the directory wiped. Staging beside the
 * target and renaming is atomic, survives open file handles, and leaves the
 * previous build untouched if anything throws.
 */
export async function build(outDir: string = join(root, "dist")): Promise<string[]> {
  const staging = `${outDir}.staging`;
  const previous = `${outDir}.previous`;
  await rm(staging, { recursive: true, force: true });
  try {
    const written = await writeSite(staging);
    await rm(previous, { recursive: true, force: true });
    await rename(outDir, previous).catch(() => undefined); // absent on a first build
    await rename(staging, outDir);
    await rm(previous, { recursive: true, force: true });
    return written;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function writeSite(outDir: string): Promise<string[]> {
  out = outDir;
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
    await markdownPage("start/index.html", join(root, "site", "content", "start.md")),
    await markdownPage("cli/index.html", join(root, "site", "content", "cli.md")),
    await specPage(),
    await referenceIndex(),
    ...(await Promise.all(CONSTRUCTS.map((name) => referencePage(name, cases[name] ?? [])))),
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

/** Construct nodes, which are the ones worth showing the source of. */
const DEMO_TYPES = new Set(["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"]);

/**
 * Wrap every top-level construct in a two-tab toggle: the rendered result, and
 * the source that produced it, sliced out of the document by the node's own
 * position. The source is never duplicated in the file, so the two panes cannot
 * drift, and because tabs are radio inputs the toggle needs no script.
 */
function withSourceToggles(tree: Root, source: string): Root {
  const children = tree.children.map((node) => {
    const at = node.position;
    if (!DEMO_TYPES.has(node.type) || !at?.start.offset === undefined || at === undefined) return node;
    const text = source.slice(at.start.offset ?? 0, at.end.offset ?? 0);
    const tab = (label: string, kids: unknown[]): unknown =>
      ({ type: "tab", depth: 3, label: [{ type: "text", value: label }], children: kids });
    return {
      type: "tabs",
      active: 1,
      id: null,
      classes: ["site-demo"],
      children: [
        tab("Result", [node]),
        tab("Markdown", [{ type: "code", lang: "markdown", meta: null, value: text }]),
      ],
    } as unknown as typeof node;
  });
  return { ...tree, children };
}

async function markdownPage(path: string, file: string, themeCss?: string | false, toggles = false): Promise<Page> {
  const source = await readFile(file, "utf8");
  const parsed = parseDocument(source);
  const { diagnostics } = parsed;
  const ast = toggles ? withSourceToggles(parsed.ast, source) : parsed.ast;
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
  const page = await markdownPage(`examples/${example.slug}/index.html`, join(root, "examples", example.file), example.theme && `css/${example.theme}`, example.toggles ?? false);
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

async function referenceIndex(): Promise<Page> {
  const intro = await readFile(join(root, "site", "content", "reference", "index.md"), "utf8");
  const { ast, diagnostics } = parseDocument(intro);
  failOnErrors(diagnostics, "reference/index.md");
  const list = CONSTRUCTS.map((name) => `<li><a href="${name}/index.html"><code>${name}</code></a> — ${esc(BLURB[name])}</li>`).join("\n");
  return { path: "reference/index.html", title: "Reference", body: renderHtml(ast) + `<ul class="site-list">\n${list}\n</ul>\n` };
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

/**
 * The examples each reference page shows, in order, with a line saying what to look
 * at. Named rather than sliced, so a page shows a chosen progression from the
 * canonical form to the awkward corners instead of whatever happens to be first.
 * A name that no longer matches a case fails the build.
 */
const REFERENCE_EXAMPLES: Record<string, Array<[string, string]>> = {
  callout: [
    ["canonical", "The marker, a title on the same line, and a body. This is GitHub's alert syntax unchanged, so it renders natively there too."],
    ["collapsed by default, no title", "A trailing `-` folds the callout. With no title, the type name is used. It becomes a `<details>` element, so folding needs no script."],
    ["body with several blocks", "The body is ordinary block content. Lists, code and further paragraphs all work; only the first line is special."],
    ["nested: callout containing a card", "A callout is a blockquote, so a directive inside it needs no extra fencing. The downgrade keeps both."],
  ],
  card: [
    ["canonical", "The bracketed argument is the title and `tone` picks one of five semantic tones. Neither names a color."],
    ["every tone", "All five tones side by side. What each one looks like is the theme's decision, not the document's."],
    ["mixed block content", "Any block content is allowed, including none. A card is a boundary, not a content type."],
    ["nested cards use a longer outer fence", "The rule that matters when nesting: the outer fence must be longer than the inner one, exactly as with code fences."],
  ],
  grid: [
    ["canonical", "Content must be exactly one list. That single rule is what makes the downgrade trivially exact: drop the fence and a list is still a list."],
    ["every cols value", "`cols` accepts 1 to 4. The stylesheet collapses to fewer columns on a narrow screen; the document does not say when."],
    ["items with nested blocks", "An item may hold several blocks, so a grid item can be a small article rather than a line."],
    ["ordered list is allowed", "An ordered list works too. The marker is not rendered, so use whichever reads better in the raw source."],
  ],
  columns: [
    ["canonical", "Content before the first `::col` is the first column. The separator is a two-colon line, so two columns do not cost two levels of fencing."],
    ["three-term ratio and gap", "`ratio` sizes the columns and its term count must equal the column count. This is the one place a document carries geometry."],
    ["id and classes on the separator", "A `::col` line takes its own attribute specifier, which is how one column is singled out for a theme."],
    ["nested inside a card", "Three levels deep, so the fences step down from the outside in: five colons, then four, then three. Each closing fence matches its own opener."],
  ],
  tabs: [
    ["canonical", "Headings become the tab labels. A renderer with no tab support shows the sections one after another, which is the downgrade."],
    ["active tab override", "`active` picks which tab opens. Panels switch with radio inputs, so there is no script."],
    ["deeper headings are tab content", "The first heading level found sets the tab level. Anything deeper is content inside that tab."],
    ["nested: a card inside a tab", "Tab content is ordinary blocks, so constructs nest inside it with the usual fence rule."],
  ],
  steps: [
    ["canonical", "Content must be exactly one ordered list. The numbering comes from the list, so the source reads as a procedure even unrendered."],
    ["items with nested blocks", "A step can carry code, a table or a further list. This is the usual shape of a real procedure."],
    ["start number is preserved", "A list starting at 3 keeps its numbering, which is how a procedure continues across sections."],
    ["nested: a card inside a step", "A card inside a step needs the outer fence to be longer, as everywhere else."],
  ],
  metrics: [
    ["canonical", "A table of at least two columns. The first is the label, the second the value, and an optional third is read as a delta."],
    ["inverse direction", "`direction=inverse` flips which sign reads as good, for a measure like churn where down is the improvement."],
    ["two columns without a delta", "The delta column is optional. Without it the tiles are label and value only."],
    ["alignment is kept", "GFM column alignment survives into the tiles, so numeric columns stay aligned."],
  ],
  figure: [
    ["canonical", "The argument is the caption and `width` is a percentage. No pixels, because the same source has to typeset to print."],
    ["table as content", "A figure may wrap a table. The caption is then emitted as the table's own `<caption>`, which is its accessible name."],
    ["code block as content", "A code block works too, which is how a listing gets a caption."],
    ["caption with inline markup", "The caption is inline content, so emphasis, code and links all work inside it."],
  ],
};

async function referencePage(name: (typeof CONSTRUCTS)[number], sectionCases: ConformanceCase[]): Promise<Page> {
  const file = join(root, "site", "content", "reference", `${name}.md`);
  const { ast, diagnostics } = parseDocument(await readFile(file, "utf8"));
  failOnErrors(diagnostics, file);
  addHeadingIds(ast);
  const chosen = REFERENCE_EXAMPLES[name] ?? [["canonical", ""]];
  const invalid = sectionCases.filter((c) => !c.valid).slice(0, 3);
  let body = renderHtml(ast);
  body += `<h2 id="examples">Examples</h2>\n`;
  for (const [caseName, note] of chosen) {
    const found = sectionCases.find((c) => c.name === caseName);
    if (!found) throw new Error(`reference/${name}: no conformance case named "${caseName}"`);
    if (note) body += `<p class="site-note">${inlineCode(note)}</p>\n`;
    body += `${caseCard(found, { showName: true })}\n`;
  }
  if (invalid.length) {
    body += `<h2 id="diagnostics">What the validator catches</h2>\n<p>Every error below is specified; nothing degrades silently.</p>\n`;
    body += invalid.map((c) => caseCard(c, { showName: true, compact: true })).join("\n");
  }
  body += `<p class="site-more">All ${sectionCases.length} cases for <code>${name}</code> are in the <a href="../../conformance/${name}/index.html">conformance browser</a>. The normative text is <a href="../../spec/index.html#4-core-constructs">spec §4</a>.</p>\n`;
  return { path: `reference/${name}/index.html`, title: `${name} — Reference`, body };
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
/** Backticks in a reference note become code elements; everything else is escaped. */
function inlineCode(text: string): string {
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

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
  const target = join(root, "dist");
  const written = await build(target);
  console.log(`site: ${written.length} pages written to ${relative(process.cwd(), target)}/`);
}
