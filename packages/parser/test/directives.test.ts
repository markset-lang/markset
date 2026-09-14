import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirectiveLine, DirectiveCode, AttrCode } from "../src/index.ts";

// Grammar coverage lives in tests/block-directive.json and
// tests/separator-directive.json. These cover offsets and propagation.

test("attribute diagnostics keep line-relative offsets", () => {
  const line = ':::card[T]{tone=a"b}';
  const result = parseDirectiveLine(line);
  assert.ok(result);
  assert.equal(result.diagnostics.length, 1);
  const [d] = result.diagnostics;
  assert.equal(d.code, AttrCode.BAD_VALUE);
  assert.equal(line.slice(d.start, d.end), 'a"b');
});

test("trailing content diagnostic points at the offending text", () => {
  const line = ":::card {tone=info}";
  const result = parseDirectiveLine(line);
  assert.ok(result);
  const [d] = result.diagnostics;
  assert.equal(d.code, DirectiveCode.TRAILING_CONTENT);
  assert.equal(line.slice(d.start, d.end), "{tone=info}");
  assert.match(d.message, /no whitespace/);
});

test("unknown name diagnostic spans the name and hints at separators", () => {
  const line = ":::col";
  const result = parseDirectiveLine(line);
  assert.ok(result);
  const [d] = result.diagnostics;
  assert.equal(d.code, DirectiveCode.UNKNOWN_NAME);
  assert.equal(line.slice(d.start, d.end), "col");
  assert.match(d.message, /separator/);
});

test("ordinary text returns null without allocating diagnostics", () => {
  for (const text of ["Hello", ": one colon", "    :::card", "std::vector", "", "  ::", ":: spaced"]) {
    assert.equal(parseDirectiveLine(text), null, JSON.stringify(text));
  }
});
