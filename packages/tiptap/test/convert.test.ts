import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset-lang/parser";
import { fromMarkset, toMarkset } from "../src/convert.ts";
import { documents } from "./documents.ts";

const withoutPositions = (tree: unknown): unknown =>
  JSON.parse(JSON.stringify(tree, (name, value) => (name === "position" ? undefined : value)));

test("a document loaded and saved unedited is byte-identical, for every document in the suite and every example", () => {
  for (const { name, source } of documents()) {
    const { doc } = fromMarkset(source);
    assert.equal(toMarkset(structuredClone(doc), source), source, name);
  }
});

test("without the original, the editor's document still saves to source that parses to the same tree", () => {
  for (const { name, source } of documents()) {
    const { doc } = fromMarkset(source);
    const saved = toMarkset(doc);
    assert.deepEqual(
      withoutPositions(parseDocument(saved).ast),
      withoutPositions(parseDocument(toMarkset(fromMarkset(saved).doc)).ast),
      name,
    );
  }
});

test("a space typed just inside bold or italic is written outside it, where Markset can say it", () => {
  const paragraph = (content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] }) as never;
  const bold = [{ type: "bold" }];
  const italic = [{ type: "italic" }];
  assert.equal(
    toMarkset(
      paragraph([
        { type: "text", text: "Plain." },
        { type: "text", text: " Bold ", marks: bold },
        { type: "text", text: "end" },
      ]),
    ),
    "Plain. **Bold** end\n",
  );
  assert.equal(
    toMarkset(
      paragraph([
        { type: "text", text: "a" },
        { type: "text", text: " ", marks: italic },
        { type: "text", text: "b" },
      ]),
    ),
    "a b\n",
  );
  // Between two runs that share the mark, the space stays inside it.
  assert.equal(toMarkset(paragraph([{ type: "text", text: "two words", marks: bold }])), "**two words**\n");
});
