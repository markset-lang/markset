/**
 * The playground: the reference implementation, running in the reader's browser.
 *
 * Every other page on this site is a document that was rendered at build time.
 * This one is the renderer itself, bundled and handed to the reader, so what
 * they see is not a demonstration of the output -- it is the output, produced by
 * the same functions the command line calls.
 *
 * Two properties are worth stating because they are easy to lose:
 *
 * 1. Nothing here evaluates the document. Invariant 4 is about what a Markset
 *    file can cause, and a Markset file causes a parse and a render, exactly as
 *    it does under `markset html`. The preview frame carries no script of its
 *    own and is sandboxed with scripting off, so that is a property of the page
 *    rather than a promise about it.
 * 2. The document never leaves the browser. Parsing is local, and the share
 *    link puts the source in the URL fragment, which is the half of a URL that
 *    is never sent to a server.
 */
import { parseDocument, type Diagnostic } from "@markset-lang/parser";
import { bodyAttributes, renderHtml } from "@markset-lang/render-html";
import { renderDowngrade } from "@markset-lang/render-downgrade";
import { decodeDocument, encodeDocument, locateAll, summarize } from "./diagnostics.ts";
import { blockBoundary, inlineAllowed, insertInto, type EntryKind } from "./vocabulary.ts";
import tour from "./samples/tour.md";
import steps from "./samples/steps.md";
import diagram from "./samples/diagram.md";
import chart from "./samples/chart.md";
import invalid from "./samples/invalid.md";

const SAMPLES: Array<{ id: string; title: string; source: string }> = [
  { id: "tour", title: "A short tour", source: tour },
  { id: "steps", title: "Steps", source: steps },
  { id: "diagram", title: "A diagram", source: diagram },
  { id: "chart", title: "A chart", source: chart },
  { id: "invalid", title: "An invalid document", source: invalid },
];

const STORAGE_KEY = "markset:playground";

function need<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`playground: #${id} is missing from the page`);
  return element as unknown as T;
}

const source = need<HTMLTextAreaElement>("pg-source");
const result = need<HTMLIFrameElement>("pg-result");
const htmlView = need<HTMLElement>("pg-html-code");
const markdownView = need<HTMLElement>("pg-markdown-code");
const astView = need<HTMLElement>("pg-ast-code");
const problemsView = need<HTMLElement>("pg-problems-body");
const problemsCount = need<HTMLElement>("pg-problems-count");
const picker = need<HTMLSelectElement>("pg-sample");
const shareButton = need<HTMLButtonElement>("pg-share");
const status = need<HTMLElement>("pg-status");

/**
 * The default stylesheet, fetched once and inlined into every preview.
 *
 * Linked instead, the frame would restyle itself a moment after each render and
 * the preview would flash on every keystroke. It is the same file the site
 * links and the same one `markset css` writes, so the preview is not a special
 * rendering with a stylesheet of its own.
 */
let stylesheet = "";

// Deliberately not renderPage(): the preview needs data-scheme on <body> to
// follow the reader's choice in the bar, which §6 defines and renderPage has no
// argument for. bodyAttributes is the same exported function renderPage uses,
// so theme tokens reach the frame by the same route.
function previewDocument(tree: ReturnType<typeof parseDocument>["ast"], scheme: string): string {
  const attributes = bodyAttributes(tree.frontmatter ?? null);
  const forced = scheme === "light" || scheme === "dark" ? ` data-scheme="${scheme}"` : "";
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<style>\n${stylesheet}\n.ms-document { padding: 1.25rem; }\n</style>\n</head>\n` +
    `<body${attributes}${forced}>\n<main class="ms-document">\n${renderHtml(tree)}</main>\n</body>\n</html>\n`
  );
}

/** The scheme the site is currently showing, which the shell records on <body>. */
function currentScheme(): string {
  return document.body.getAttribute("data-scheme") ?? "";
}

function renderProblems(text: string, diagnostics: Diagnostic[]): void {
  problemsCount.textContent = diagnostics.length ? String(diagnostics.length) : "";
  problemsCount.hidden = diagnostics.length === 0;
  if (diagnostics.length === 0) {
    problemsView.innerHTML = "";
    const clean = document.createElement("p");
    clean.className = "pg-empty";
    clean.textContent = "No problems. Every construct in this document is one Markset defines.";
    problemsView.append(clean);
    return;
  }
  const list = document.createElement("ul");
  list.className = "pg-problems";
  for (const d of locateAll(text, diagnostics)) {
    const item = document.createElement("li");
    item.dataset.severity = d.severity;
    const where = document.createElement("button");
    where.type = "button";
    where.className = "pg-where";
    where.textContent = `${d.line}:${d.column}`;
    // The offset is the only thing tying a diagnostic back to the text, and a
    // reader with an error on line 40 of a scrolled textarea cannot see it.
    where.addEventListener("click", () => {
      source.focus();
      source.setSelectionRange(d.start, d.end);
    });
    const severity = document.createElement("span");
    severity.className = "pg-severity";
    severity.textContent = d.severity;
    const code = document.createElement("code");
    code.textContent = d.code;
    const message = document.createElement("span");
    message.textContent = d.message;
    item.append(where, " ", severity, " ", code, " ", message);
    list.append(item);
  }
  problemsView.innerHTML = "";
  problemsView.append(list);
}

let lastFailure = "";

// Rendering is fast enough to do on every keystroke for a short document and
// not for a long one, so it waits for a pause in typing. The preview is never
// more than a moment behind, and the browser is never busy while a key is down.
let pending = 0;

function update(): void {
  // Supersede anything the debounce has queued. Without this a render that was
  // scheduled by a keystroke lands a moment after an explicit update and
  // overwrites what it put in the status line -- so the confirmation of an
  // insert made within a keystroke of typing vanished before it was read.
  window.clearTimeout(pending);
  const text = source.value;
  try {
    const { ast, diagnostics } = parseDocument(text);
    // A document with errors still renders. That is the point of reporting them
    // rather than refusing: the reader fixing an unclosed fence can see what the
    // rest of the document already looks like.
    result.srcdoc = previewDocument(ast, currentScheme());
    htmlView.textContent = renderHtml(ast);
    markdownView.textContent = renderDowngrade(ast);
    astView.textContent = JSON.stringify(ast, (key, value) => (key === "position" ? undefined : value), 2);
    renderProblems(text, diagnostics);
    setStatus(summarize(diagnostics));
    lastFailure = "";
  } catch (error) {
    // A throw from the parser is a bug in the implementation, not in the
    // document. Say so plainly and keep the last good preview on screen, rather
    // than blanking the page and leaving the reader to guess which of the two
    // is broken.
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastFailure) {
      lastFailure = message;
      problemsView.innerHTML = "";
      const failed = document.createElement("p");
      failed.className = "pg-empty";
      failed.textContent = `The renderer threw on this document: ${message}. That is a bug in Markset rather than in what you wrote — the share link below reproduces it.`;
      problemsView.append(failed);
      problemsCount.hidden = false;
      problemsCount.textContent = "!";
    }
    setStatus("The renderer threw");
  }
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Private windows and blocked site data. Losing the draft on reload is a
    // smaller problem than failing to render at all.
  }
}

let statusTimer = 0;
function setStatus(text: string): void {
  status.textContent = text;
  window.clearTimeout(statusTimer);
}

function announce(text: string): void {
  status.textContent = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => update(), 2500);
}

function scheduleUpdate(): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(update, 120);
}

function load(text: string): void {
  source.value = text;
  update();
}

for (const sample of SAMPLES) {
  const option = document.createElement("option");
  option.value = sample.id;
  option.textContent = sample.title;
  picker.append(option);
}

picker.addEventListener("change", () => {
  const sample = SAMPLES.find((s) => s.id === picker.value);
  if (sample) {
    load(sample.source);
    // The fragment describes the document in the editor, and it no longer does.
    history.replaceState(null, "", location.pathname + location.search);
  }
});

source.addEventListener("input", scheduleUpdate);

shareButton.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#${encodeDocument(source.value)}`;
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url);
    announce("Link copied. The document is in the fragment, so it is never sent to a server.");
  } catch {
    // Clipboard access is refused in plenty of ordinary situations. The URL bar
    // now holds the link either way, which is the part that matters.
    announce("The address bar now holds a link to this document.");
  }
});

/**
 * Inserting from the palette.
 *
 * The snippet is read out of the page rather than carried in the bundle: the
 * Vocabulary tab is already displaying it, and one copy is the difference
 * between a palette that can drift from its own documentation and one that
 * cannot. Every button, in the bar and in the tab, names an entry by id.
 *
 * The inserted text is left selected. A snippet dropped into a long document
 * is otherwise invisible -- the reader clicks, nothing appears to happen,
 * because it landed below the fold -- and a selection is also the thing that
 * makes the next keystroke replace it, which is what you want from an example.
 */
function insertEntry(id: string): void {
  const entry = document.getElementById(`pg-entry-${id}`);
  const snippet = entry?.querySelector("pre code")?.textContent;
  const kind = entry?.dataset.kind as EntryKind | undefined;
  if (!entry || !snippet || !kind) return;
  const before = source.value;
  // Parsed again rather than cached from the last render: the reader may have
  // typed since, and an insertion point from a stale tree is an insertion in
  // the wrong place -- which is the failure this boundary exists to prevent.
  const tree = parseDocument(before).ast;
  const caret = source.selectionStart;
  const { text, start, end } = insertInto(
    before,
    { kind, snippet },
    caret,
    blockBoundary(tree, caret),
    inlineAllowed(tree, caret),
  );
  const unchanged = text === before;
  source.value = text;
  source.focus();
  source.setSelectionRange(start, end);
  // Bring the selection into view. A textarea does not scroll to a programmatic
  // selection on its own, so a snippet inserted off-screen stays off-screen and
  // the button looks as though it did nothing.
  source.blur();
  source.focus();
  update();
  // After update(), which writes the diagnostic summary into the same place.
  if (unchanged && kind === "frontmatter") {
    announce("This document already has frontmatter. It is selected above, ready to edit.");
  } else {
    announce(`Inserted ${id}, and selected it.`);
  }
}

for (const button of document.querySelectorAll<HTMLElement>("[data-insert]")) {
  button.addEventListener("click", () => insertEntry(button.dataset.insert ?? ""));
}

/**
 * The tab strip.
 *
 * These get real tab roles and arrow-key movement, which the `tabs` construct
 * deliberately does not emit -- because that construct has no script and cannot
 * keep the promise those roles make. Here there is one, so the promise is kept.
 */
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[role=tab]"));
function selectTab(chosen: HTMLButtonElement): void {
  for (const tab of tabs) {
    const selected = tab === chosen;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !selected;
  }
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
}

// A scheme change re-renders the preview, because the frame is a separate
// document and the control in the bar cannot reach inside it.
new MutationObserver(() => update()).observe(document.body, {
  attributes: true,
  attributeFilter: ["data-scheme"],
});

const shared = location.hash.slice(1);
const restored = shared ? decodeDocument(shared) : null;
let initial = SAMPLES[0].source;
if (restored !== null && restored !== "") {
  initial = restored;
} else {
  try {
    initial = localStorage.getItem(STORAGE_KEY) || initial;
  } catch {
    // As above: no stored draft is not a failure.
  }
}

// The stylesheet has to arrive before the first preview, or the first thing the
// reader sees is unstyled and then jumps. Everything else is ready immediately.
source.value = initial;
selectTab(tabs[0]);
fetch(new URL("../css/markset.css", document.baseURI))
  .then((response) => (response.ok ? response.text() : ""))
  .catch(() => "")
  .then((css) => {
    stylesheet = css;
    update();
    document.body.dataset.playgroundReady = "true";
  });
