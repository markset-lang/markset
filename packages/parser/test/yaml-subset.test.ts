import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYamlSubset } from "../src/index.ts";

test("maps, nesting, scalars, and comments", () => {
  const { value, error } = parseYamlSubset(
    [
      "markset: 0",
      'title: "Quoted: with colon"  # trailing comment',
      "single: 'it''s'",
      "# full-line comment",
      "flag: true",
      "nothing: ~",
      "ratio: 1.25",
      "neg: -3",
      "theme:",
      "  preset: deck",
      "  type:",
      "    scale: 1.2",
      "url: https://example.test/#anchor",
    ].join("\n"),
  );
  assert.equal(error, null);
  assert.deepEqual(value, {
    markset: 0,
    title: "Quoted: with colon",
    single: "it's",
    flag: true,
    nothing: null,
    ratio: 1.25,
    neg: -3,
    theme: { preset: "deck", type: { scale: 1.2 } },
    url: "https://example.test/#anchor",
  });
});

test("block and flow sequences, including maps in sequences", () => {
  const { value, error } = parseYamlSubset(
    'tags: [a, "b, c", 3]\nauthors:\n  - name: X\n    role: y\n  - name: Z\nplain:\n  - one\n  - two\n',
  );
  assert.equal(error, null);
  assert.deepEqual(value, {
    tags: ["a", "b, c", 3],
    authors: [{ name: "X", role: "y" }, { name: "Z" }],
    plain: ["one", "two"],
  });
});

test("literal and folded block scalars", () => {
  const { value } = parseYamlSubset("lit: |\n  one\n  two\nfold: >\n  one\n  two\nafter: 1\n");
  assert.deepEqual(value, { lit: "one\ntwo", fold: "one two", after: 1 });
});

test("empty key and empty document", () => {
  assert.deepEqual(parseYamlSubset("").value, {});
  assert.deepEqual(parseYamlSubset("key:\n").value, { key: null });
});

test("errors report the line and stop", () => {
  const bad = parseYamlSubset("ok: 1\n  stray: 2\n");
  assert.deepEqual(bad.error, { message: "unexpected indentation", line: 2 });
  assert.deepEqual(bad.value, {});
  assert.equal(parseYamlSubset("- a\n- b\n").error?.message, "frontmatter must be a mapping");
  assert.equal(parseYamlSubset("not a key\n").error?.message, 'expected "key: value"');
  assert.equal(parseYamlSubset('q: "open\n').error?.message, "unterminated quoted string");
});
