import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ListItem, Root } from "mdast";
import { defaultHandlers, toMarkdown, type Options } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMarkset from "@markset-lang/remark-markset";
import { marksetToMarkdownExtension, parseDocument, serializeDocument } from "../src/index.ts";
import { CANONICAL_OPTIONS } from "../src/to-markdown.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const LINE_SECTIONS = new Set(["attribute-specifier", "block-directive", "separator-directive"]);

function documents(): Array<{ name: string; source: string }> {
  const docs: Array<{ name: string; source: string }> = [];
  for (const file of readdirSync(`${repo}tests`).sort()) {
    const cases = JSON.parse(readFileSync(`${repo}tests/${file}`, "utf8")) as Array<{
      section: string;
      markset: string;
    }>;
    cases.forEach((c, i) => {
      if (LINE_SECTIONS.has(c.section) && !c.markset.includes("\n")) return;
      docs.push({ name: `${file} #${i}`, source: c.markset });
    });
  }
  for (const dir of ["examples", "test/corpus"]) {
    for (const file of readdirSync(`${repo}${dir}`).sort()) {
      if (file.endsWith(".md")) docs.push({ name: file, source: readFileSync(`${repo}${dir}/${file}`, "utf8") });
    }
  }
  return docs;
}

const withoutPositions = (tree: unknown): unknown =>
  JSON.parse(JSON.stringify(tree, (name, value) => (name === "position" ? undefined : value)));

/**
 * Stand-ins for remark-gfm's strikethrough and task-list writers, built the way
 * mdast-util-gfm-strikethrough and mdast-util-gfm-task-list-item build theirs:
 * a `delete` handler, and a `listItem` handler that calls the default one and
 * puts the checkbox after the marker. The task list is the one that matters,
 * because it replaces a handler Markset's attribute lines also wrap.
 */
const strikethrough: Options = {
  handlers: {
    delete(node, _, state, info) {
      const exit = state.enter("strikethrough" as never);
      const value = `~~${state.containerPhrasing(node, { ...info, before: "~", after: "~" })}~~`;
      exit();
      return value;
    },
  },
};
const taskList: Options = {
  handlers: {
    listItem(node, parent, state, info) {
      const value = defaultHandlers.listItem(node, parent, state, info);
      const checked = (node as ListItem).checked;
      if (typeof checked !== "boolean") return value;
      return value.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, (marker) => `${marker}[${checked ? "x" : " "}] `);
    },
  },
};

test("written with the extension, every suite document and example reads back as the same tree", () => {
  const failed: string[] = [];
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    const written = toMarkdown(ast, {
      ...CANONICAL_OPTIONS,
      extensions: [gfmTableToMarkdown(), frontmatterToMarkdown(["yaml"]), marksetToMarkdownExtension()],
    });
    const again = parseDocument(written).ast;
    if (JSON.stringify(withoutPositions(again)) !== JSON.stringify(withoutPositions(ast))) failed.push(name);
  }
  assert.deepEqual(failed, []);
});

test("with the canonical options, the extension writes what serializeDocument writes", () => {
  const failed: string[] = [];
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    const written = toMarkdown(ast, {
      ...CANONICAL_OPTIONS,
      extensions: [gfmTableToMarkdown(), frontmatterToMarkdown(["yaml"]), marksetToMarkdownExtension()],
    });
    if (written !== serializeDocument(ast)) failed.push(name);
  }
  assert.deepEqual(failed, []);
});

/** A card holding an attribute line, a task list and a strikethrough. */
function mixedTree(): Root {
  const tree = parseDocument(":::card[Plan]{tone=info}\n{.lead}\nShip it.\n\n- done\n- open\n:::\n").ast;
  const card = tree.children[0] as unknown as { children: Array<{ type: string; children: unknown[] }> };
  const [paragraph, list] = card.children;
  paragraph.children.push({ type: "text", value: " " }, { type: "delete", children: [{ type: "text", value: "Not" }] });
  const [done, open] = list.children as ListItem[];
  done.checked = true;
  open.checked = false;
  return tree;
}

const MIXED = ":::card[Plan]{tone=info}\n{.lead}\nShip it. ~~Not~~\n\n- [x] done\n- [ ] open\n:::\n";

test("beside GFM's writers, in either order, a task list and strikethrough keep working inside a construct", () => {
  for (const extensions of [
    [strikethrough, taskList, marksetToMarkdownExtension()],
    [marksetToMarkdownExtension(), strikethrough, taskList],
  ]) {
    assert.equal(toMarkdown(mixedTree(), { ...CANONICAL_OPTIONS, extensions }), MIXED);
  }
});

test("two copies of the extension write one attribute line, not two", () => {
  const { ast } = parseDocument("{.lead}\nText.\n");
  const written = toMarkdown(ast, { extensions: [marksetToMarkdownExtension(), marksetToMarkdownExtension()] });
  assert.equal(written, "{.lead}\nText.\n");
});

test("remark-markset registers the extension, so a pipeline that writes Markdown writes Markset", () => {
  const processor = unified().use(remarkParse).use(remarkMarkset).freeze();
  const data = processor.data() as { toMarkdownExtensions?: Options[] };
  assert.equal(data.toMarkdownExtensions?.length, 1);

  // What remark-stringify does with that list, beside the pipeline's other extensions.
  const source = ":::grid{cols=3}\n- {.hot}\n  One\n- Two\n:::\n\n{#intro}\nA [span]{.badge}.\n";
  const tree = processor.runSync(processor.parse(source)) as Root;
  const written = toMarkdown(tree, {
    ...CANONICAL_OPTIONS,
    extensions: [strikethrough, ...(data.toMarkdownExtensions ?? []), taskList],
  });
  assert.equal(written, source);
});
