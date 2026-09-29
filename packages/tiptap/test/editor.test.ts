import "./dom.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor, getSchema } from "@tiptap/core";
import { parseDocument } from "@markset-lang/parser";
import {
  CONSTRUCTS,
  Markset,
  fromMarkset,
  problems,
  refreshDiagnostics,
  toMarkset,
  type JSONNode,
} from "../src/index.ts";
import { documents } from "./documents.ts";

const schema = getSchema([Markset]);

function editorFor(source: string): Editor {
  return new Editor({ extensions: [Markset], content: fromMarkset(source).doc as never });
}

test("the schema accepts every document in the suite and every example, as loaded", () => {
  for (const { name, source } of documents()) {
    assert.doesNotThrow(() => schema.nodeFromJSON(fromMarkset(source).doc).check(), name);
  }
});

test("a document opened in the editor and saved unedited is byte-identical", () => {
  for (const { name, source } of documents()) {
    const editor = editorFor(source);
    assert.equal(toMarkset(editor.getJSON() as JSONNode, source), source, name);
    editor.destroy();
  }
});

test("the editor's HTML reads back as the same document, which is what copy and paste rely on", () => {
  for (const { name, source } of documents()) {
    const editor = editorFor(source);
    const again = new Editor({ extensions: [Markset], content: editor.getHTML() });
    assert.deepEqual(again.getJSON(), editor.getJSON(), name);
    editor.destroy();
    again.destroy();
  }
});

const clean = (source: string) => parseDocument(source).diagnostics.filter((d) => d.severity === "error");

/** One valid change to each construct's own fields, and the fence or marker line it should produce. */
const EDITS: Record<(typeof CONSTRUCTS)[number], [Record<string, unknown>, string]> = {
  callout: [{ kind: "WARNING", fold: "closed" }, "> [!WARNING]-"],
  card: [{ tone: "warn", compact: true }, ":::card[Title]{tone=warn compact=true}"],
  grid: [{ cols: 3, gap: "lg" }, ":::grid{cols=3 gap=lg}"],
  columns: [{ ratio: [2, 1] }, ":::columns{ratio=2:1}"],
  tabs: [{ active: 2, id: "install" }, ":::tabs{#install active=2}"],
  steps: [{ classes: ["numbered"] }, ":::steps{.numbered}"],
  metrics: [{ direction: "inverse" }, ":::metrics{direction=inverse}"],
  figure: [{ width: 50, chart: "bar" }, ":::figure[Caption]{width=50% chart=bar}"],
};

for (const name of CONSTRUCTS) {
  test(`${name}: inserted, edited and removed, it saves as a valid document each time`, () => {
    const source = "# Doc\n\nText.\n";
    const editor = editorFor(source);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    assert.ok(editor.commands.insertConstruct(name));
    const saved = toMarkset(editor.getJSON() as JSONNode, source);
    assert.deepEqual(clean(saved), [], saved);
    assert.ok(saved.startsWith("# Doc\n\nText.\n"), "what was there is untouched");
    assert.ok(
      parseDocument(saved).ast.children.some((node) => node.type === name),
      saved,
    );

    // Put the selection inside the construct, edit its fields, then remove it.
    let inside = -1;
    editor.state.doc.descendants((node, pos) => {
      if (inside === -1 && node.type.name === name) inside = pos + 2;
    });
    editor.commands.setTextSelection(inside);
    const [attributes, line] = EDITS[name];
    assert.ok(editor.commands.setConstructAttributes(attributes, name));
    const edited = toMarkset(editor.getJSON() as JSONNode, source);
    assert.ok(edited.split("\n").includes(line), edited);
    assert.deepEqual(clean(edited), [], edited);
    assert.ok(editor.commands.removeConstruct(name));
    assert.equal(toMarkset(editor.getJSON() as JSONNode, source), source);
    editor.destroy();
  });
}

function selectInside(editor: Editor, type: string): void {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.type.name === type) at = pos + 1;
  });
  // The first text position at or after the node's start.
  let text = -1;
  editor.state.doc.nodesBetween(at, editor.state.doc.content.size, (node, pos) => {
    if (text === -1 && node.isText) text = pos;
  });
  editor.commands.setTextSelection(text);
}

test("setting a construct's attributes to a value §4 allows is one changed line", () => {
  const source = ":::grid{cols=3}\n- a\n- b\n:::\n";
  const editor = editorFor(source);
  selectInside(editor, "grid");
  assert.ok(editor.commands.setConstructAttributes({ cols: 4 }));
  assert.equal(toMarkset(editor.getJSON() as JSONNode, source), ":::grid{cols=4}\n- a\n- b\n:::\n");
});

test("a value §4 does not allow is refused, and the document is unchanged", () => {
  const source = ":::card[T]{tone=info}\nx\n:::\n\n:::grid\n- a\n:::\n";
  const editor = editorFor(source);
  selectInside(editor, "card");
  assert.equal(editor.commands.setConstructAttributes({ tone: "purple" }), false);
  assert.equal(editor.commands.setConstructAttributes({ nope: 1 }), false);
  selectInside(editor, "grid");
  assert.equal(editor.commands.setConstructAttributes({ cols: 7 }), false);
  assert.equal(toMarkset(editor.getJSON() as JSONNode, source), source);
});

test("the schema holds §4's content rules: a grid is one list, steps one ordered list, a figure one block", () => {
  const { nodes } = schema;
  const text = (value: string) => nodes.paragraph.create(null, schema.text(value));
  const item = nodes.listItem.create(null, text("a"));
  const bullets = nodes.bulletList.create(null, item);
  const numbers = nodes.orderedList.create(null, item);
  assert.doesNotThrow(() => nodes.grid.createChecked(null, bullets));
  assert.throws(() => nodes.grid.createChecked(null, [bullets, text("stray")]));
  assert.throws(() => nodes.grid.createChecked(null, text("not a list")));
  assert.doesNotThrow(() => nodes.steps.createChecked(null, numbers));
  assert.throws(() => nodes.steps.createChecked(null, bullets));
  assert.throws(() => nodes.figure.createChecked(null, [nodes.figureImage.create({ src: "a.png" }), text("two")]));
  assert.throws(() => nodes.metrics.createChecked(null, text("not a table")));
});

test("a metrics table cannot lose its second column", () => {
  const source = ":::metrics\n| Metric | Value |\n|---|---|\n| Revenue | $1M |\n:::\n";
  const editor = editorFor(source);
  const before = editor.getJSON();
  // Delete the second cell of every row.
  const tr = editor.state.tr;
  const cells: Array<[number, number]> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableRow") cells.push([pos + 1 + node.child(0).nodeSize, node.child(1).nodeSize]);
  });
  for (const [pos, size] of cells.reverse()) tr.delete(pos, pos + size);
  editor.view.dispatch(tr);
  assert.deepEqual(editor.getJSON(), before, "the edit was refused");
  assert.deepEqual(problems(editor.state.doc), []);
});

test("removing a column drops a ratio that no longer matches, rather than saving an error", () => {
  const source = '::::columns{ratio="2:1"}\nA\n\n::col\n\nB\n::::\n';
  const editor = editorFor(source);
  let last: [number, number] | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "column") last = [pos, node.nodeSize];
  });
  const [pos, size] = last!;
  editor.view.dispatch(editor.state.tr.delete(pos, pos + size));
  const saved = toMarkset(editor.getJSON() as JSONNode, source);
  assert.equal(saved, "::::columns\nA\n::::\n");
  assert.deepEqual(clean(saved), []);
});

test("a heading typed into a tab at the tab's own level is pushed below it, so it cannot become a tab", () => {
  const source = ":::tabs\n### One\nText.\n:::\n";
  const editor = editorFor(source);
  selectInside(editor, "paragraph");
  editor.commands.setNode("heading", { level: 3 });
  const saved = toMarkset(editor.getJSON() as JSONNode, source);
  assert.equal(saved, ":::tabs\n### One\n#### Text.\n:::\n");
  assert.equal((parseDocument(saved).ast.children[0] as unknown as { children: unknown[] }).children.length, 1);
});

test("a span can be set on selected text, and only with identifiers", () => {
  const source = "Some text here.\n";
  const editor = editorFor(source);
  editor.commands.setTextSelection({ from: 6, to: 10 });
  assert.equal(editor.commands.setSpan({ classes: ["not valid"] }), false);
  assert.ok(editor.commands.setSpan({ classes: ["badge"] }));
  assert.equal(toMarkset(editor.getJSON() as JSONNode, source), "Some [text]{.badge} here.\n");
});

test("block attributes are an attribute line, and an edit to the text keeps it as written", () => {
  const source = "{.lead}\nOpening.\n";
  const editor = editorFor(source);
  selectInside(editor, "paragraph");
  assert.ok(editor.commands.setBlockAttributes({ id: null, classes: ["muted"], attrs: {} }));
  assert.equal(toMarkset(editor.getJSON() as JSONNode, source), "{.muted}\nOpening.\n");
});

test("typing into one card changes that card's line and nothing else", () => {
  const source = ":::card[One]\nFirst _card_.\n:::\n\n:::card[Two]\nSecond _card_.\n:::\n";
  const editor = editorFor(source);
  selectInside(editor, "paragraph");
  editor.commands.insertContent("Very ");
  assert.equal(
    toMarkset(editor.getJSON() as JSONNode, source),
    ":::card[One]\nVery First _card_.\n:::\n\n:::card[Two]\nSecond _card_.\n:::\n",
  );
});

test("diagnostics from a loaded document are shown on the blocks they are about", () => {
  const source = "Fine.\n\n:::grid\nNot a list.\n:::\n";
  const loaded = fromMarkset(source);
  assert.deepEqual(
    loaded.diagnostics.map((d) => [d.code, d.path]),
    [["GRID_CONTENT", [1]]],
  );
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [Markset],
    content: loaded.doc as never,
  });
  refreshDiagnostics(editor, source);
  const marked = editor.view.dom.querySelectorAll(".ms-diagnostic");
  assert.equal(marked.length, 1);
  assert.equal(marked[0].getAttribute("data-code"), "GRID_CONTENT");
  editor.destroy();
});

test("frontmatter is kept verbatim and handed over as data", () => {
  const source = "---\nmarkset: 0\ntitle: Kept\ntheme:\n  preset: report\n---\n\nBody.\n";
  const loaded = fromMarkset(source);
  assert.equal(loaded.frontmatter?.markset, 0);
  assert.equal(loaded.frontmatter?.theme?.preset, "report");
  assert.equal(loaded.doc.content?.[0].attrs?.value, "markset: 0\ntitle: Kept\ntheme:\n  preset: report");
  const editor = editorFor(source);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  editor.commands.insertContent(" More.");
  assert.equal(
    toMarkset(editor.getJSON() as JSONNode, source),
    "---\nmarkset: 0\ntitle: Kept\ntheme:\n  preset: report\n---\n\nBody. More.\n",
  );
});
