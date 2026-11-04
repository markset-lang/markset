import "./dom.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Editor, getSchema } from "@tiptap/core";
import type { Nodes, Root } from "mdast";
import { parseDocument, serializeDocument } from "@markset-lang/parser";
import {
  CONSTRUCTS,
  MarksetConstructs,
  constructProblems,
  jsonToMdast,
  mdastToJSON,
  type JSONNode,
} from "../src/index.ts";
import { HOST, HOST_EXTENSIONS, STARTER_KIT_AND_TABLE_KIT } from "./host-schema.ts";

const repo = new URL("../../../", import.meta.url).pathname;
const schema = getSchema(HOST_EXTENSIONS);

/** Every case of the eight construct sections of the suite, and every example. */
function documents(): Array<{ name: string; source: string }> {
  const docs: Array<{ name: string; source: string }> = [];
  for (const section of CONSTRUCTS) {
    const cases = JSON.parse(readFileSync(`${repo}tests/${section}.json`, "utf8")) as Array<{ markset: string }>;
    for (const [i, c] of cases.entries()) docs.push({ name: `${section}.json #${i}`, source: c.markset });
  }
  for (const file of readdirSync(`${repo}examples`).sort()) {
    if (file.endsWith(".md")) docs.push({ name: file, source: readFileSync(`${repo}examples/${file}`, "utf8") });
  }
  return docs;
}

type Node = Nodes & { children?: Node[]; [field: string]: unknown };
const CONSTRUCT_TYPES = new Set<string>([...CONSTRUCTS, "column", "tab", "directive", "separator"]);

/** Every construct in the tree, in document order, by its own fields: what a host must never lose. */
function constructs(tree: Root): string[] {
  const found: string[] = [];
  const visit = (node: Node) => {
    if (CONSTRUCT_TYPES.has(node.type)) {
      const { children: _children, position: _position, data: _data, ...own } = node;
      found.push(JSON.stringify(own, (key, value) => (key === "position" ? undefined : value)));
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree as Node);
  return found;
}

function itemsOpenWithParagraph(tree: Root): boolean {
  let open = true;
  const visit = (node: Node) => {
    if (node.type === "listItem" && node.children?.[0]?.type !== "paragraph") open = false;
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree as Node);
  return open;
}

/** Whether the tree holds only what this host's schema can: else a save is valid, but not the same bytes. */
function heldWhole(tree: Root): boolean {
  let whole = true;
  const visit = (node: Node, parent: Node | null) => {
    const own = node as unknown as Record<string, unknown>;
    if (["yaml", "html", "definition", "imageReference", "linkReference", "span"].includes(node.type)) whole = false;
    if (own.attributes && !["callout", "tab", "directive", "separator", "span"].includes(node.type)) whole = false;
    if (node.type === "image" && !(parent?.type === "paragraph" && parent.children?.length === 1)) whole = false;
    if ((node.type === "list" || node.type === "listItem") && own.spread) whole = false;
    if (node.type === "code" && own.meta) whole = false;
    if (node.type === "table" && (own.align as unknown[]).some((a) => a !== null)) whole = false;
    if (node.type === "listItem" && node.children?.[0]?.type !== "paragraph") whole = false;
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(tree as Node, null);
  return whole;
}

function open(source: string): { editor: Editor; ast: Root } {
  const { ast } = parseDocument(source);
  return { editor: new Editor({ extensions: HOST_EXTENSIONS, content: mdastToJSON(ast, HOST) as never }), ast };
}

function save(editor: Editor, source: string, ast: Root): string {
  return serializeDocument(jsonToMdast(editor.getJSON() as JSONNode, HOST, { original: ast }), {
    original: { source, ast },
  });
}

test("MarksetConstructs builds a schema beside StarterKit, TableKit, task lists and a block image", () => {
  for (const name of ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"]) {
    assert.ok(schema.nodes[name], name);
  }
  for (const name of ["directive", "directiveArgument", "separator"]) assert.ok(schema.nodes[name], name);
  assert.equal(schema.nodes.figureImage, undefined, "a host that names its own image gets no figureImage");
  assert.equal(schema.nodes.figure.spec.content, "figureCaption? (image | table | codeBlock)");
  assert.equal(schema.nodes.cardTitle.spec.content, "inline*");
  assert.equal(schema.nodes.paragraph.spec.content, "inline*", "the host's own nodes are the host's");
  assert.equal(schema.marks.span, undefined, "no mark of the kit's comes with it");
  assert.doesNotThrow(() =>
    getSchema([...STARTER_KIT_AND_TABLE_KIT, MarksetConstructs.configure({ titleContent: "inline*" })]),
  );
});

test("every construct case and example loads in that schema and saves as a valid document with its constructs", () => {
  let whole = 0;
  const wholeSections = new Set<string>();
  for (const { name, source } of documents()) {
    const { editor, ast } = open(source);
    // StarterKit's list item opens with a paragraph, so a grid item that opens with a heading, as most of the
    // examples' do, is content its schema does not allow. ProseMirror keeps it as loaded, and it saves.
    if (itemsOpenWithParagraph(ast)) assert.doesNotThrow(() => editor.state.doc.check(), name);
    else assert.throws(() => editor.state.doc.check(), /Invalid content for node listItem/u, name);
    const saved = save(editor, source, ast);
    const again = parseDocument(saved);
    const errorsBefore = parseDocument(source)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code);
    assert.deepEqual(
      again.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      errorsBefore,
      `${name}: saving adds or removes no error\n${saved}`,
    );
    assert.deepEqual(constructs(again.ast), constructs(ast), `${name}: every construct is kept as it was`);
    if (heldWhole(ast)) {
      assert.equal(saved, source, `${name}: a document the schema holds whole saves byte for byte`);
      whole++;
      wholeSections.add(name.split(".")[0]);
    }
    editor.destroy();
  }
  assert.deepEqual([...wholeSections].sort(), [...CONSTRUCTS].sort(), "every construct has a case saved byte for byte");
  assert.ok(whole >= 60, `${whole} documents saved byte for byte`);
});

test("insertConstruct shapes each template for the host: TableKit cells, a block image's figure", () => {
  for (const name of CONSTRUCTS) {
    const editor = new Editor({
      extensions: HOST_EXTENSIONS,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    assert.ok(editor.commands.insertConstruct(name), name);
    assert.doesNotThrow(() => editor.state.doc.check(), name);
    const tree = jsonToMdast(editor.getJSON() as JSONNode, HOST);
    assert.ok(
      tree.children.some((node) => node.type === name),
      name,
    );
    const saved = serializeDocument(tree);
    assert.deepEqual(parseDocument(saved).diagnostics, [], saved);
    if (name === "metrics") {
      let header = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "tableHeader") header++;
        return true;
      });
      assert.equal(header, 3, "the header row is TableKit's header cells");
    }
    editor.destroy();
  }
});

test("the guards check constructs only: a host's heading or table is its own business", () => {
  const { editor } = open(":::metrics\n| Metric | Value |\n|---|---|\n| Revenue | $1M |\n:::\n");
  assert.deepEqual(constructProblems(editor.state.doc), []);
  const before = editor.getJSON();
  // Deleting the metrics table's second column is refused.
  const tr = editor.state.tr;
  const cells: Array<[number, number]> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableRow") cells.push([pos + 1 + node.child(0).nodeSize, node.child(1).nodeSize]);
  });
  for (const [pos, size] of cells.reverse()) tr.delete(pos, pos + size);
  editor.view.dispatch(tr);
  assert.deepEqual(editor.getJSON(), before, "the edit was refused");
  // A heading level the kit would refuse is not a construct's, so it is left alone.
  const { nodes } = editor.schema;
  editor.view.dispatch(editor.state.tr.insert(0, nodes.heading.create({ level: 9 }, editor.schema.text("H"))));
  assert.equal(editor.state.doc.firstChild?.attrs.level, 9);
  editor.destroy();
});

test("a hard break or newline in a title becomes a space, and Enter in a title moves into the body", () => {
  const { editor } = open(":::card[Title]\nBody.\n:::\n");
  let title = -1;
  editor.state.doc.descendants((node, pos) => {
    if (title === -1 && node.type.name === "cardTitle") title = pos + 1;
  });
  editor.view.dispatch(editor.state.tr.insert(title + 2, editor.schema.nodes.hardBreak.create()));
  assert.equal(editor.state.doc.nodeAt(title)?.textContent, "Ti tle");
  editor.commands.setTextSelection(title + 1);
  const enter = new KeyboardEvent("keydown", { key: "Enter" });
  assert.ok(editor.view.someProp("handleKeyDown", (handle) => handle(editor.view, enter as never)));
  assert.equal(editor.state.selection.$from.parent.type.name, "paragraph");
  assert.equal(editor.state.doc.firstChild?.childCount, 2, "no second title was made");
  editor.destroy();
});

test("skipNormalize: a collaborator's change is neither refused nor normalized again", () => {
  const { editor } = open(":::card[Title]\nBody.\n:::\n");
  let title = -1;
  editor.state.doc.descendants((node, pos) => {
    if (title === -1 && node.type.name === "cardTitle") title = pos + 1;
  });
  // As y-tiptap applies a change from the shared document: already normalized where it was made.
  const remote = editor.state.tr.insertText("\n", title + 2).setMeta("y-sync$", { isChangeOrigin: true });
  editor.view.dispatch(remote);
  assert.equal(editor.state.doc.nodeAt(title)?.textContent, "Ti\ntle", "left for the editor that made it");
  editor.view.dispatch(editor.state.tr.insertText("!", editor.state.doc.content.size - 3));
  assert.equal(editor.state.doc.nodeAt(title)?.textContent, "Ti tle", "this editor's own change normalizes");
  editor.destroy();
});
