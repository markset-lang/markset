import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Root } from "mdast";
import { parseDocument, serializeDocument } from "@markset-lang/parser";
import {
  CONSTRUCTS,
  constructTemplate,
  fromMarkset,
  jsonToMdast,
  mdastToJSON,
  toMarkset,
  type JSONNode,
} from "../src/convert.ts";
import { construct } from "../src/extensions.ts";
import { documents } from "./documents.ts";
import { STREAMLANE, withCellAttributes } from "./host.ts";

const withoutPositions = (tree: unknown): unknown =>
  JSON.parse(JSON.stringify(tree, (name, value) => (name === "position" ? undefined : value)));

const root = (...children: Root["children"]): Root => ({ type: "root", children });

test("the convert entry imports neither TipTap nor anything that needs a DOM", () => {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const [, specifier] of source.matchAll(/^(?:import|export)[^"']*from\s+["']([^"']+)["']/gmu)) {
      if (specifier.startsWith("./")) visit(new URL(specifier, new URL(file, import.meta.url)).href);
      else assert.ok(["@markset-lang/parser", "mdast"].includes(specifier), `${file} imports ${specifier}`);
    }
    assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\./u, `${file} reaches for the DOM`);
  };
  visit("../src/convert.ts");
  assert.ok(seen.size >= 2, "convert.ts and model.ts were both read");
});

test("without a host, mdastToJSON and jsonToMdast are what fromMarkset and toMarkset are made of", () => {
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    const doc = mdastToJSON(ast);
    assert.deepEqual(doc, fromMarkset(source).doc, name);
    const tree = jsonToMdast(doc, {}, { original: ast });
    assert.equal(serializeDocument(tree, { original: { source, ast } }), toMarkset(doc, source), name);
  }
});

test("each construct's template is the mdast insertConstruct starts from", () => {
  for (const name of CONSTRUCTS) {
    const template = constructTemplate(name);
    assert.equal(template.type, name);
    assert.equal(JSON.stringify(template).includes('"position"'), false, `${name} carries no source positions`);
    assert.deepEqual(mdastToJSON(root(template)).content?.[0], construct(name), name);
  }
  assert.notEqual(constructTemplate("card"), constructTemplate("card"), "each call is a fresh tree to change");
});

test("in a TableKit host, a construct's template reads as header cells holding paragraphs", () => {
  const metrics = mdastToJSON(root(constructTemplate("metrics")), STREAMLANE).content?.[0];
  const table = metrics?.content?.[0];
  assert.equal(table?.type, "table");
  const [header, body] = table?.content ?? [];
  assert.deepEqual(
    header.content?.map((cell) => cell.type),
    ["tableHeader", "tableHeader", "tableHeader"],
  );
  assert.deepEqual(body.content?.[0], {
    type: "tableCell",
    content: [{ type: "paragraph", attrs: { attributes: null }, content: [{ type: "text", text: "Revenue" }] }],
  });
});

test("in Streamlane's schema, every suite document and example reads and writes back to the same tree", () => {
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    const doc = mdastToJSON(ast, STREAMLANE);
    const saved = serializeDocument(jsonToMdast(doc, STREAMLANE));
    assert.deepEqual(withoutPositions(parseDocument(saved).ast), withoutPositions(ast), name);
  }
});

test("in Streamlane's schema, a document saved unedited against its source is byte-identical", () => {
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    // As the editor hands it back: every cell carrying TableKit's own attributes.
    const doc = withCellAttributes(mdastToJSON(ast, STREAMLANE));
    const tree = jsonToMdast(doc, STREAMLANE, { original: ast });
    assert.equal(serializeDocument(tree, { original: { source, ast } }), source, name);
  }
});

test("only the host's nodes and marks: task lists, strikethrough, a block image, a dropped highlight and a mention", () => {
  const doc: JSONNode = {
    type: "doc",
    content: [
      {
        type: "card",
        attrs: { tone: "info", compact: false, id: null, classes: [] },
        content: [
          { type: "cardTitle", content: [{ type: "text", text: "Plan" }] },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: true },
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Ship ", marks: [{ type: "commentHighlight", attrs: { thread: "t1" } }] },
                      { type: "text", text: "it", marks: [{ type: "strike" }, { type: "bold" }] },
                    ],
                  },
                ],
              },
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Ask " },
                      { type: "mention", attrs: { id: "p1", label: "Ada" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { type: "image", attrs: { src: "chart.png", alt: "A chart", title: null } },
      {
        type: "table",
        attrs: { align: [null, null] },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
              },
              {
                type: "tableHeader",
                attrs: { colspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "one" }] },
                  { type: "paragraph", content: [{ type: "text", text: "line" }] },
                ],
              },
              { type: "tableCell", content: [{ type: "paragraph" }] },
            ],
          },
        ],
      },
    ],
  };
  const tree = jsonToMdast(doc, STREAMLANE);
  const card = tree.children[0] as unknown as {
    children: Array<{ type: string; children: Array<{ checked?: boolean }> }>;
  };
  assert.deepEqual(
    card.children[0].children.map((item) => item.checked),
    [true, false],
  );
  const markdown = serializeDocument(
    // serializeDocument checks its output by parsing it, and Markset's parser reads no GFM task list or
    // strikethrough, so those are compared as mdast below and the source is written without them.
    jsonToMdast({ type: "doc", content: doc.content?.slice(1) }, STREAMLANE),
  );
  assert.equal(markdown, "![A chart](chart.png)\n\n| A        | B |\n| -------- | - |\n| one line |   |\n");

  // And back: what remark-gfm would hand over reads as the host's own nodes again.
  const again = mdastToJSON(tree, STREAMLANE);
  const list = again.content?.[0].content?.[1];
  assert.equal(list?.type, "taskList");
  assert.deepEqual(list?.content?.[0].content?.[0].content, [
    { type: "text", text: "Ship " },
    // A host's mark nests inside Markset's, just outside code; ProseMirror orders marks by its schema anyway.
    { type: "text", text: "it", marks: [{ type: "bold" }, { type: "strike" }] },
  ]);
  assert.deepEqual(list?.content?.[1].content?.[0].content, [{ type: "text", text: "Ask @Ada" }]);
  assert.deepEqual(again.content?.[1], { type: "image", attrs: { src: "chart.png", alt: "A chart", title: null } });
});

test("a host's name for one of Markset's nodes is used both ways, and the Markset name is left to the host", () => {
  const { ast } = parseDocument("Text ![alt](a.png) more.\n");
  const doc = mdastToJSON(ast, STREAMLANE);
  assert.deepEqual(doc.content?.[0].content?.[1], {
    type: "inlineImage",
    attrs: { src: "a.png", alt: "alt", title: null },
  });
  assert.equal(serializeDocument(jsonToMdast(doc, STREAMLANE)), "Text ![alt](a.png) more.\n");
  assert.throws(
    () =>
      jsonToMdast(
        { type: "doc", content: [{ type: "paragraph", content: [{ type: "image", attrs: {} }] }] },
        {
          names: { image: "inlineImage" },
        },
      ),
    /no mdast for inline editor node "image"/u,
  );
});
