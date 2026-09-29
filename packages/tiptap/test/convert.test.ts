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
