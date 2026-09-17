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
import {
  addHeadingIds,
  parseDocument,
  renderDowngrade,
  renderHtml,
  bodyAttributes,
  defaultStylesheetPath,
  type Diagnostic,
} from "./deps.ts";
import { drawMermaid } from "./mermaid.ts";

const root = resolve(import.meta.dirname, "..");
/** Repository and site URLs come from package.json so they cannot drift from the remote. */
const pkg = JSON.parse(await readFile(join(resolve(import.meta.dirname, ".."), "package.json"), "utf8")) as {
  repository: { url: string };
};
const REPO = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

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
  section: string;
  name?: string;
  markset: string;
  html?: string;
  downgrade?: string;
  ast?: unknown;
  valid: boolean;
  diagnostics?: string[];
}

const NAV: Array<[string, string]> = [
  ["Home", "index.html"],
  ["Start", "start/index.html"],
  ["Reference", "reference/index.html"],
  ["CLI", "cli/index.html"],
  ["Spec", "spec/index.html"],
  ["Conformance", "conformance/index.html"],
  ["Examples", "examples/index.html"],
];

/** Documents rendered as their own pages, with the theme stylesheet each one is meant to be read with (spec §6). */
/**
 * Every document under examples/ and the page it becomes. A test asserts this
 * list covers the directory exactly, in both directions: a document that is not
 * listed here is one nobody reviewed for publication, and a listing with no
 * document behind it is a dead page. An unlisted file rode along in a commit
 * once and had to be removed from history.
 */
export const EXAMPLES: Array<{
  slug: string;
  file: string;
  title: string;
  theme?: string;
  toggles?: boolean;
  /** Two or three words naming the genre, so the index can be scanned rather than read. */
  kicker: string;
  blurb: string;
}> = [
  {
    slug: "showcase",
    file: "showcase.md",
    title: "Showcase",
    toggles: true,
    kicker: "Construct tour",
    blurb:
      "Every construct at the size it would really be used, each carrying a tab that holds the exact source which produced it. It names no theme of its own, so it shows the vocabulary on whatever stylesheet renders it.",
  },
  {
    slug: "notification-routing",
    file: "notification-routing.md",
    title: "Analysis document",
    theme: "dossier.css",
    kicker: "Analysis",
    blurb:
      "A long analysis whose source names no colors and no widths. The status chips, the layer rail and the tinted pipeline stage are all author classes that a theme stylesheet interprets, which is what keeps the document portable.",
  },
  {
    slug: "strategy-read",
    file: "strategy-read.md",
    title: "Strategy memo",
    theme: "memo.css",
    kicker: "Memo",
    blurb:
      "An argued memo in a newspaper register: a masthead, a captioned data table, marked sections in a two-lane grid, pull quotes and source citations.",
  },
  {
    slug: "runbook",
    file: "runbook.md",
    title: "On-call runbook",
    theme: "runbook.css",
    kicker: "Runbook",
    blurb:
      "The shortest and densest genre there is, read under time pressure, where the first screen has to be the answer. Triage steps that rank themselves, a symptom grid, procedures in tabs and an escalation table.",
  },
  {
    slug: "config-reference",
    file: "config-reference.md",
    title: "Configuration reference",
    kicker: "Reference",
    blurb:
      "Mostly tables and code: resolution order, a table of keys per section, the same configuration in four formats, and a deprecation table. The one long example that names no theme, so it is read on the site's own stylesheet.",
  },
  {
    slug: "architecture",
    file: "architecture.md",
    title: "Architecture overview",
    theme: "tidewater.css",
    kicker: "Architecture",
    blurb:
      "The genre that is mostly diagrams. A system map, a state machine and a deployment topology, each an ASCII fence in the source rather than an image file kept in step by hand — and one fence deliberately left as code.",
  },
  {
    slug: "incident-review",
    file: "incident-review.md",
    title: "Incident review",
    theme: "incident.css",
    kicker: "Postmortem",
    blurb:
      "A postmortem in the register of a printed report: an impact strip, a timeline on a rail, a factors table with a real caption, and an action list where the committed items mark themselves.",
  },
];

const CONSTRUCTS = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const;
/**
 * Diagram engines for this site (spec §10).
 *
 * `ascii` comes with the renderer. `mermaid` is added here because a
 * documentation site that talks about other diagram languages should show one
 * rather than describe it — see site/mermaid.ts for how the color scheme is
 * handled.
 *
 * An engine that fails fails the build, rather than taking §10's fallback. The
 * fallback is right for a renderer that does not know what the page says; here
 * the pages state that these are drawn, so quietly shipping a code block would
 * make the site contradict itself.
 */
const DIAGRAMS = {
  engines: { mermaid: drawMermaid },
  onError: (error: Error, language: string): never => {
    throw new Error(`site: the ${language} engine failed: ${error.message}`);
  },
};

const SECTION_ORDER = [
  "attribute-specifier",
  "bracketed-span",
  "block-directive",
  "separator-directive",
  "attribute-line",
  ...CONSTRUCTS,
  "frontmatter",
  "diagram",
];

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
  // Both scratch directories are unique to this build. They used to be fixed
  // names, which is fine until two builds overlap: `npm run site` while
  // `site:watch` is rebuilding, and each one deletes the staging directory the
  // other is still writing into. The tree that got renamed into place was
  // whatever survived, which looked exactly like a page whose stylesheet had
  // vanished. Renaming is still what publishes the build, so a reader never
  // sees a half-written tree and a failure leaves the previous one intact.
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const staging = `${outDir}.staging-${tag}`;
  const scratch = [staging];
  try {
    const written = await writeSite(staging);
    for (let attempt = 0; ; attempt++) {
      // A fresh name each time round. Reusing one meant the second attempt's
      // rename landed on a directory that already existed, failed, and left the
      // output in place — so the retry could never make progress.
      const previous = `${outDir}.previous-${tag}-${attempt}`;
      scratch.push(previous);
      await rename(outDir, previous).catch(() => undefined); // absent on a first build
      try {
        await rename(staging, outDir);
        break;
      } catch (error) {
        // Another build landed a complete tree between our two renames. Its
        // output is as valid as ours, so step aside and publish over it.
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 3 || (code !== "ENOTEMPTY" && code !== "EEXIST")) throw error;
      }
    }
    return written;
  } finally {
    for (const path of scratch) await rm(path, { recursive: true, force: true });
  }
}

async function writeSite(outDir: string): Promise<string[]> {
  // Local, not module-level. As a shared variable two builds running in one
  // process would each redirect the other's remaining writes, and the tree that
  // got published would be missing whatever the loser had left to write.
  const out = outDir;
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
    await markdownPage("github-pages/index.html", join(root, "site", "content", "github-pages.md")),
    await specPage(),
    await referenceIndex(),
    await markdownPage(
      "reference/frontmatter/index.html",
      join(root, "site", "content", "reference", "frontmatter.md"),
    ),
    await markdownPage("reference/diagrams/index.html", join(root, "site", "content", "reference", "diagrams.md")),
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
    const tab = (label: string, kids: unknown[]): unknown => ({
      type: "tab",
      depth: 3,
      label: [{ type: "text", value: label }],
      children: kids,
    });
    return {
      type: "tabs",
      active: 1,
      id: null,
      classes: ["site-demo"],
      children: [tab("Result", [node]), tab("Markdown", [{ type: "code", lang: "markdown", meta: null, value: text }])],
    } as unknown as typeof node;
  });
  return { ...tree, children };
}

async function markdownPage(path: string, file: string, themeCss?: string | false, toggles = false): Promise<Page> {
  const source = await readFile(file, "utf8");
  const parsed = parseDocument(source);
  const { diagnostics } = parsed;
  failOnErrors(diagnostics, file);
  const ast = addHeadingIds(toggles ? withSourceToggles(parsed.ast, source) : parsed.ast);
  return {
    path,
    title: firstHeading(ast) ?? basename(file, ".md"),
    body: renderHtml(ast, { diagrams: DIAGRAMS }),
    themeAttributes: bodyAttributes(ast.frontmatter ?? null),
    ...(themeCss ? { themeCss } : {}),
  };
}

/** One example document, with links to the index and to the other examples so no page is a dead end. */
async function examplePage(example: (typeof EXAMPLES)[number]): Promise<Page> {
  const page = await markdownPage(
    `examples/${example.slug}/index.html`,
    join(root, "examples", example.file),
    example.theme && `css/${example.theme}`,
    example.toggles ?? false,
  );
  const others = EXAMPLES.filter((e) => e.slug !== example.slug).map(
    (e) => `<a href="../${e.slug}/index.html">${esc(e.title)}</a>`,
  );
  const source = `<a href="${REPO}/blob/main/examples/${esc(example.file)}">source</a>`;
  page.body += `<p class="site-more">Examples: <a href="../index.html">all</a>${others.length ? ` · ${others.join(" · ")}` : ""} · ${source}</p>\n`;
  return page;
}

async function examplesIndex(): Promise<Page> {
  const intro = await readFile(join(root, "site", "content", "examples", "index.md"), "utf8");
  const { ast, diagnostics } = parseDocument(intro);
  failOnErrors(diagnostics, "examples/index.md");

  // The listing is generated as Markset source and rendered, rather than
  // assembled as HTML. It costs nothing and it keeps the claim honest: every
  // page on this site really is a Markset document, including the generated
  // ones, and the index dogfoods `grid` on the page that advertises the
  // vocabulary. A generation bug fails the build loudly rather than shipping
  // broken markup.
  const tour = EXAMPLES.find((e) => e.toggles) ?? EXAMPLES[0];
  const documents = EXAMPLES.filter((e) => e !== tour);
  const footer = (e: (typeof EXAMPLES)[number]): string =>
    [e.kicker, e.theme ? `theme \`${e.theme}\`` : "no theme", `[source](${REPO}/blob/main/examples/${e.file})`].join(
      " · ",
    );

  const source = [
    `:::card[Start here]{tone=info}`,
    `### [${tour.title}](${tour.slug}/index.html)`,
    ``,
    tour.blurb,
    ``,
    `{.small .muted}`,
    footer(tour),
    `:::`,
    ``,
    `## ${numberWord(documents.length)} complete documents`,
    ``,
    `{.small .muted}`,
    `Every company, system and number in these is invented.`,
    ``,
    `:::grid{cols=2}`,
    ...documents.map((e) =>
      [
        `- ### [${e.title}](${e.slug}/index.html)`,
        ``,
        `  ${e.blurb}`,
        ``,
        `  {.small .muted}`,
        `  ${footer(e)}`,
        ``,
      ].join("\n"),
    ),
    `:::`,
    ``,
  ].join("\n");

  const listing = parseDocument(source);
  failOnErrors(listing.diagnostics, "examples/index.html (generated listing)");

  return {
    path: "examples/index.html",
    title: "Examples",
    body: renderHtml(ast) + renderHtml(listing.ast),
  };
}

/** Small numbers read better as words in a heading, and the count changes when an example is added. */
function numberWord(n: number): string {
  return ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ?? String(n);
}

async function specPage(): Promise<Page> {
  const file = join(root, "spec", "v0.md");
  const parsed = parseDocument(await readFile(file, "utf8"));
  failOnErrors(parsed.diagnostics, file);
  const ast = addHeadingIds(parsed.ast);
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
  const list = CONSTRUCTS.map(
    (name) => `<li><a href="${name}/index.html"><code>${name}</code></a> — ${esc(BLURB[name])}</li>`,
  ).join("\n");
  // Two reference pages are not constructs. They used to be trailing notes
  // under the eight, which is where a reader who is looking for diagrams does
  // not look: the page existed and was reported as missing. They get a heading
  // and a list of their own now, so the section is somewhere rather than after.
  const beyond = [
    `<li><a href="diagrams/index.html">Diagrams</a> — an ASCII or mermaid fence becomes a picture, why that needs no ninth construct, and what a renderer may and may not do with one.</li>`,
    `<li><a href="frontmatter/index.html">Frontmatter and theme tokens</a> — the version key, the seven theme tokens, and what each preset changes.</li>`,
  ].join("\n");
  return {
    path: "reference/index.html",
    title: "Reference",
    body:
      `${renderHtml(ast)}<ul class="site-list">\n${list}\n</ul>\n` +
      `<h2 id="beyond-the-constructs">Beyond the constructs</h2>\n` +
      `<p>Two things a document does that no construct covers.</p>\n` +
      `<ul class="site-list">\n${beyond}\n</ul>\n`,
  };
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
    [
      "canonical",
      "The marker, a title on the same line, and a body. This is GitHub's alert syntax unchanged, so it renders natively there too.",
    ],
    [
      "collapsed by default, no title",
      "A trailing `-` folds the callout. With no title, the type name is used. It becomes a `<details>` element, so folding needs no script.",
    ],
    [
      "body with several blocks",
      "The body is ordinary block content. Lists, code and further paragraphs all work; only the first line is special.",
    ],
    [
      "nested: callout containing a card",
      "A callout is a blockquote, so a directive inside it needs no extra fencing. The downgrade keeps both.",
    ],
  ],
  card: [
    [
      "canonical",
      "The bracketed argument is the title and `tone` picks one of five semantic tones. Neither names a color.",
    ],
    [
      "every tone",
      "All five tones side by side. What each one looks like is the theme's decision, not the document's.",
    ],
    ["mixed block content", "Any block content is allowed, including none. A card is a boundary, not a content type."],
    [
      "nested cards use a longer outer fence",
      "The rule that matters when nesting: the outer fence must be longer than the inner one, exactly as with code fences.",
    ],
  ],
  grid: [
    [
      "canonical",
      "Content must be exactly one list. That single rule is what makes the downgrade trivially exact: drop the fence and a list is still a list.",
    ],
    [
      "every cols value",
      "`cols` accepts 1 to 4. The stylesheet collapses to fewer columns on a narrow screen; the document does not say when.",
    ],
    [
      "items with nested blocks",
      "An item may hold several blocks, so a grid item can be a small article rather than a line.",
    ],
    [
      "ordered list is allowed",
      "An ordered list works too. The marker is not rendered, so use whichever reads better in the raw source.",
    ],
  ],
  columns: [
    [
      "canonical",
      "Content before the first `::col` is the first column. The separator is a two-colon line, so two columns do not cost two levels of fencing.",
    ],
    [
      "three-term ratio and gap",
      "`ratio` sizes the columns and its term count must equal the column count. This is the one place a document carries geometry.",
    ],
    [
      "id and classes on the separator",
      "A `::col` line takes its own attribute specifier, which is how one column is singled out for a theme.",
    ],
    [
      "nested inside a card",
      "Three levels deep, so the fences step down from the outside in: five colons, then four, then three. Each closing fence matches its own opener.",
    ],
  ],
  tabs: [
    [
      "canonical",
      "Headings become the tab labels. A renderer with no tab support shows the sections one after another, which is the downgrade.",
    ],
    ["active tab override", "`active` picks which tab opens. Panels switch with radio inputs, so there is no script."],
    [
      "deeper headings are tab content",
      "The first heading level found sets the tab level. Anything deeper is content inside that tab.",
    ],
    [
      "nested: a card inside a tab",
      "Tab content is ordinary blocks, so constructs nest inside it with the usual fence rule.",
    ],
  ],
  steps: [
    [
      "canonical",
      "Content must be exactly one ordered list. The numbering comes from the list, so the source reads as a procedure even unrendered.",
    ],
    [
      "items with nested blocks",
      "A step can carry code, a table or a further list. This is the usual shape of a real procedure.",
    ],
    [
      "start number is preserved",
      "A list starting at 3 keeps its numbering, which is how a procedure continues across sections.",
    ],
    ["nested: a card inside a step", "A card inside a step needs the outer fence to be longer, as everywhere else."],
  ],
  metrics: [
    [
      "canonical",
      "A table of at least two columns. The first is the label, the second the value, and an optional third is read as a delta.",
    ],
    [
      "inverse direction",
      "`direction=inverse` flips which sign reads as good, for a measure like churn where down is the improvement.",
    ],
    ["two columns without a delta", "The delta column is optional. Without it the tiles are label and value only."],
    ["alignment is kept", "GFM column alignment survives into the tiles, so numeric columns stay aligned."],
  ],
  figure: [
    [
      "canonical",
      "The argument is the caption and `width` is a percentage. No pixels, because the same source has to typeset to print.",
    ],
    [
      "table as content",
      "A figure may wrap a table. The caption is then emitted as the table's own `<caption>`, which is its accessible name.",
    ],
    ["code block as content", "A code block works too, which is how a listing gets a caption."],
    ["caption with inline markup", "The caption is inline content, so emphasis, code and links all work inside it."],
  ],
};

async function referencePage(name: (typeof CONSTRUCTS)[number], sectionCases: ConformanceCase[]): Promise<Page> {
  const file = join(root, "site", "content", "reference", `${name}.md`);
  const parsed = parseDocument(await readFile(file, "utf8"));
  failOnErrors(parsed.diagnostics, file);
  const ast = addHeadingIds(parsed.ast);
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
  const rows = SECTION_ORDER.filter((s) => cases[s])
    .map((s) => {
      const list = cases[s];
      const invalid = list.filter((c) => !c.valid).length;
      return `<tr><td><a href="${s}/index.html"><code>${s}</code></a></td><td>${list.length}</td><td>${list.length - invalid}</td><td>${invalid}</td></tr>`;
    })
    .join("\n");
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
  const isDocument =
    c.section === "frontmatter" ||
    c.section === "bracketed-span" ||
    c.section === "attribute-line" ||
    (CONSTRUCTS as readonly string[]).includes(c.section) ||
    c.markset.includes("\n");
  const label = options.showName
    ? `<h3 class="site-case-title">${options.index ? `<span class="site-case-index">#${options.index}</span> ` : ""}${esc(c.name ?? "case")}</h3>`
    : "";
  const badge = c.valid ? "" : ` <span class="ms-span badge danger">invalid</span>`;
  const diags = (c.diagnostics ?? []).length
    ? `<p class="site-diagnostics">Diagnostics: ${(c.diagnostics ?? []).map((d) => `<code>${esc(d)}</code>`).join(" ")}</p>`
    : "";
  let rendered = "";
  let downgrade = "";
  if (isDocument) {
    const { ast } = parseDocument(c.markset);
    rendered = `<div class="site-pane"><h4>Rendered</h4><div class="site-preview">\n${renderHtml(ast)}</div></div>`;
    if (!options.compact)
      downgrade = `<div class="site-pane"><h4>Downgrade</h4><pre><code>${esc(renderDowngrade(ast) || "(empty)")}</code></pre></div>`;
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
    const active =
      page.path === href || (href !== "index.html" && page.path.startsWith(href.replace("index.html", "")));
    const icon = NAV_ICONS[label];
    const body = icon ? `${icon}<span class="site-visually-hidden">${label}</span>` : label;
    const title = icon ? ` title="${label}"` : "";
    return `<a href="${rel}${href}"${active ? ' aria-current="page"' : ""}${title}>${body}</a>`;
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
${SCHEME_SCRIPT}<header class="site-header">
<a class="site-brand" href="${rel}index.html">Markset</a>
<nav class="site-nav">
${nav}
<a href="${REPO}" title="GitHub">${ICON_GITHUB}<span class="site-visually-hidden">GitHub</span></a>
</nav>
${SCHEME_CONTROL}</header>
<div class="site-layout${page.toc ? " has-toc" : ""}">
${page.toc ? `<aside class="site-toc"><nav aria-label="Contents">${page.toc}</nav></aside>\n` : ""}<main class="ms-document">
${page.body}</main>
</div>
<footer class="site-footer">Markset is a strict superset of CommonMark with a closed layout vocabulary. Every page on this site is written in Markset and built by the reference implementation.</footer>
</body>
</html>
`;
}

/**
 * Reader's choice of color scheme, as three radio inputs and their labels.
 *
 * The control itself is CSS: the inputs carry the state, body:has() in site.css
 * reads it, and markset.css resolves every color from color-scheme, so forcing
 * one is a single property. Auto is checked, so a reader who never touches it
 * keeps their system preference.
 *
 * The state lives in the markup, which means it does not outlive the document
 * — and carrying a choice across page loads is the one part of this no CSS can
 * do. SCHEME_SCRIPT is that part and nothing else; see its comment for why the
 * page still works without it.
 */
/**
 * Inline icons for the app bar.
 *
 * Inline rather than linked so they need no second request and inherit
 * currentColor, which is what makes them follow the reader's color scheme for
 * free. Each one is decorative in the accessibility tree: the link or label
 * around it carries real text, visually hidden, so an icon-only control still
 * has a name to announce.
 */
const ICON_HOME = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.8 12 3l9 6.8V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`;

/** The GitHub mark, used unmodified as the link to the repository. */
const ICON_GITHUB = `<svg class="site-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

const ICON_AUTO = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg>`;
const ICON_LIGHT = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>`;
const ICON_DARK = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z"/></svg>`;

/** Nav entries that show as an icon instead of their word. The word stays as the accessible name. */
const NAV_ICONS: Record<string, string> = { Home: ICON_HOME };

const SCHEME_CONTROL = `<div class="site-scheme-slot"><div class="site-scheme" role="group" aria-label="Color scheme">
<input type="radio" name="ms-scheme" id="ms-scheme-auto" class="site-scheme-input" checked>
<label class="site-scheme-option" for="ms-scheme-auto" title="Match the system">${ICON_AUTO}<span class="site-visually-hidden">Auto</span></label>
<input type="radio" name="ms-scheme" id="ms-scheme-light" class="site-scheme-input">
<label class="site-scheme-option" for="ms-scheme-light" title="Light">${ICON_LIGHT}<span class="site-visually-hidden">Light</span></label>
<input type="radio" name="ms-scheme" id="ms-scheme-dark" class="site-scheme-input">
<label class="site-scheme-option" for="ms-scheme-dark" title="Dark">${ICON_DARK}<span class="site-visually-hidden">Dark</span></label>
</div></div>
`;

/**
 * The only script on a built page, and the only thing it does is carry the
 * reader's scheme choice from one page to the next.
 *
 * Everything else about the control is CSS. This exists because the state has
 * to outlive the document, and a static site has no server to set a cookie.
 * The rule the site keeps is narrower than "no script anywhere" but is the one
 * that matters: nothing rendered *from a Markset document* contains a script,
 * which is what the home page claims and what makes a rendered document safe
 * to paste anywhere. This is chrome, outside <main>, and a test pins that.
 *
 * With scripting off the control still works for the page it is on, because
 * the radios and body:has() are the mechanism and this only restores and
 * records what they hold. It writes data-scheme on <body> — the hook markset.css
 * already publishes (§6) — rather than inventing a second one, and it runs as
 * the first thing in <body> so the scheme is in force before anything paints.
 */
const SCHEME_SCRIPT = `<script>
(function () {
  var key = "ms-scheme";
  var read = function () {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null; // private mode, blocked storage, file://
    }
  };
  var apply = function (value) {
    if (value === "light" || value === "dark") document.body.dataset.scheme = value;
    else delete document.body.dataset.scheme;
  };
  apply(read());
  // Delegated, so it is listening before the control it listens for is parsed.
  document.addEventListener("change", function (event) {
    var input = event.target;
    if (!input || input.name !== key) return;
    var value = input.id.slice(key.length + 1);
    apply(value);
    try {
      if (value === "auto") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  });
  document.addEventListener("DOMContentLoaded", function () {
    // Collapsed, the control shows the checked option's icon, so the radio has
    // to agree with the scheme in force or it reports the wrong one. Setting
    // checked fires no change event, so this cannot loop.
    var value = read();
    var input = document.getElementById(key + "-" + (value === "light" || value === "dark" ? value : "auto"));
    if (input) input.checked = true;
  });
})();
</script>
`;

function tableOfContents(ast: Root, min: number, max: number): string {
  const items = ast.children.filter((n): n is Heading => n.type === "heading" && n.depth >= min && n.depth <= max);
  return `<ul>\n${items.map((h) => `<li class="toc-${h.depth}"><a href="#${h.attributes?.id ?? ""}">${esc(text(h))}</a></li>`).join("\n")}\n</ul>`;
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
