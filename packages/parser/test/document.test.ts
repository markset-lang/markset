import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { parseDocument } from "../src/index.ts";

// Structural coverage lives in tests/block-directive.json,
// tests/separator-directive.json, and tests/bracketed-span.json.

test("CommonMark documents produce exactly the baseline mdast tree, positions included", () => {
  const docs = [
    "# Title\n\nA paragraph with *emphasis*, `code`, and a [link](https://x.y).\n\n- one\n- two\n\n> quote\n",
    "Setext\n======\n\n1. a\n2. b\n\n```js\nlet x = 1;\n```\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
    "Brackets [not a span] and [ref][id] and ![img](i.png)\n\n[id]: https://example.test\n",
    "Colons :: and ::: inside text, and a line\n:: that is not a separator\n",
  ];
  for (const source of docs) {
    const baseline = fromMarkdown(source, { extensions: [gfmTable()], mdastExtensions: [gfmTableFromMarkdown()] });
    const { ast, diagnostics } = parseDocument(source);
    assert.deepEqual(ast, baseline, source);
    assert.deepEqual(diagnostics, []);
  }
});

test("fence-line diagnostics carry document offsets", () => {
  const source = "Intro.\n\n:::card{#}\nbody\n:::\n";
  const { diagnostics } = parseDocument(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(source.slice(diagnostics[0].start, diagnostics[0].end), "#");
});

test("span diagnostics carry document offsets across lines", () => {
  const source = 'Line one.\nLine two with [x]{tone=a"b} here.\n';
  const { diagnostics } = parseDocument(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "ATTR_BAD_VALUE");
  assert.equal(source.slice(diagnostics[0].start, diagnostics[0].end), 'a"b');
});

test("unclosed warning points at the opening fence line", () => {
  const source = "> :::card{tone=info}\n> body\n";
  const { diagnostics } = parseDocument(source);
  assert.deepEqual(
    diagnostics.map((d) => [d.code, d.severity]),
    [["DIRECTIVE_UNCLOSED", "warning"]],
  );
  assert.equal(source.slice(diagnostics[0].start, diagnostics[0].end), ":::card{tone=info}");
});

test("diagnostics are sorted by offset across parser and structure passes", () => {
  const source = "::col\n\n:::card{#}\n:::\n\n::col\n";
  const { diagnostics } = parseDocument(source);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    ["SEPARATOR_OUTSIDE_PARENT", "ATTR_BAD_IDENTIFIER", "SEPARATOR_OUTSIDE_PARENT"],
  );
  for (let i = 1; i < diagnostics.length; i++) assert.ok(diagnostics[i - 1].start <= diagnostics[i].start);
});

test("construct nodes carry positions like other mdast nodes", () => {
  const { ast } = parseDocument("para\n\n:::card\nx\n:::\n");
  const directive = ast.children[1];
  assert.equal(directive.type, "card");
  assert.deepEqual(directive.position?.start, { line: 3, column: 1, offset: 6 });
  assert.deepEqual(directive.position?.end, { line: 5, column: 4, offset: 19 });
});
