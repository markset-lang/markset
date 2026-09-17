import { test } from "node:test";
import assert from "node:assert/strict";
import type { Root } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { parseDocument } from "@markset-lang/parser";
import { marksetHandlers, renderHtml } from "@markset-lang/render-html";
import remarkMarkset from "@markset-lang/remark-markset";

/** Keeps the mdast tree on its way past, so one pipeline can answer both questions. */
function capture(sink: { tree?: Root }) {
  return () =>
    (tree: Root): undefined => {
      sink.tree = structuredClone(tree);
      return undefined;
    };
}

/** A stock pipeline, assembled the way a reader of the README would assemble it. */
function pipeline(sink: { tree?: Root }) {
  return unified()
    .use(remarkParse)
    .use(remarkMarkset)
    .use(capture(sink))
    .use(remarkRehype, { handlers: marksetHandlers() })
    .use(rehypeStringify);
}

async function run(source: string) {
  const sink: { tree?: Root } = {};
  const file = await pipeline(sink).process(source);
  return { tree: sink.tree as Root, html: String(file), messages: file.messages };
}

test("a construct becomes a typed node in an ordinary remark pipeline", async () => {
  const { tree } = await run(":::grid{cols=3}\n- One\n- Two\n- Three\n:::\n");
  const grid = tree.children[0] as unknown as { type: string; cols?: number };
  assert.equal(grid.type, "grid", "the directive normalized into a construct node");
  assert.equal(grid.cols, 3, "and carries its own field, not a generic attribute bag");
});

test("the same document renders through remark-rehype", async () => {
  const { html } = await run(":::card[Ship it]{tone=info}\nBody.\n:::\n");
  assert.match(html, /class="ms-card"/u);
  assert.match(html, /data-tone="info"/u);
  assert.match(html, /Ship it/u);
});

test("plain CommonMark is untouched, which is the superset claim", async () => {
  const source = "# Title\n\nA paragraph with *emphasis* and `code`.\n\n- a\n- b\n";
  const { html } = await run(source);
  const without = String(await unified().use(remarkParse).use(remarkRehype).use(rehypeStringify).process(source));
  assert.equal(html, without, "adding the plugin changed the output of a CommonMark document");
});

test("diagnostics arrive as vfile messages, with severity preserved", async () => {
  const { messages } = await run(":::nonsense\nBody.\n:::\n");
  assert.ok(messages.length > 0, "an unknown directive is reported");
  const m = messages[0];
  assert.equal(m.source, "markset");
  assert.ok(m.ruleId, "carries the diagnostic code, so a linter can act on it");
  assert.equal(m.fatal, true, "an unknown name is an error, not a warning (closed vocabulary)");
  assert.ok((m.line ?? 0) >= 1 && (m.column ?? 0) >= 1, "and points somewhere in the file");
});

test("two documents do not share each other's diagnostics", async () => {
  // The mdast extension collects into one array and is built once per use(),
  // so this is the failure mode worth pinning: one pipeline, a bad document
  // and then a good one, and the good one must come back clean.
  const sink: { tree?: Root } = {};
  const processor = pipeline(sink);
  const bad = await processor.process(":::nonsense\nBody.\n:::\n");
  const good = await processor.process("# Fine\n\nNothing wrong here.\n");
  assert.ok(bad.messages.length > 0);
  assert.deepEqual(
    good.messages.map((m) => m.reason),
    [],
    "a clean document inherited diagnostics from the one before it",
  );
});

test("the pipeline agrees with renderHtml, on a document that uses both attribute forms", async () => {
  // The strong property, and the one that keeps two copies of the attribute
  // lowering from drifting: assembling the pieces through unified must produce
  // what the library's own renderer produces. If someone adds a construct to
  // one path and not the other, or changes which node types carry their own
  // attributes, this is what notices.
  const source = [
    "# Title",
    "",
    "{.lead #intro}",
    "A paragraph carrying an attribute line.",
    "",
    ":::grid{cols=2}",
    "- One",
    "- Two",
    ":::",
    "",
    ":::card[Titled]{tone=warn}",
    "Body with [a span]{.badge}.",
    ":::",
    "",
    "> [!NOTE] Heads up",
    "> A callout.",
    "",
  ].join("\n");

  const { ast } = parseDocument(source);
  const direct = renderHtml(ast, { headingIds: false });

  // No table in that document, deliberately. Tables are GFM, so parseDocument
  // reads them and a bare remark pipeline does not -- the caller adds
  // remark-gfm if they want them. That asymmetry is the plugin doing its job:
  // it adds Markset and nothing else.
  const sink: { tree?: Root } = {};
  const viaUnified = String(await pipeline(sink).process(source));

  assert.equal(`${viaUnified}\n`, direct);
});
