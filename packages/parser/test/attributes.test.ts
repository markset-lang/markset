import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttributeSpecifier, AttrCode } from "../src/index.ts";

// Grammar coverage lives in tests/attribute-specifier.json. These tests cover
// the API surface the conformance driver cannot see: offsets, embedding, and
// diagnostic positions.

test("returns null when there is no opening brace at start", () => {
  assert.equal(parseAttributeSpecifier("#id", 0), null);
  assert.equal(parseAttributeSpecifier("x{}", 0), null);
});

test("parses from an offset and reports where it stopped", () => {
  const source = ':::card[Title]{#a .b tone="info"} trailing';
  const start = source.indexOf("{");
  const result = parseAttributeSpecifier(source, start);
  assert.ok(result);
  assert.equal(source.slice(result.end), " trailing");
  assert.deepEqual(result.attributes, { type: "attributes", id: "a", classes: ["b"], attrs: { tone: "info" } });
  assert.deepEqual(result.diagnostics, []);
});

test("stops at the first closing brace outside quotes", () => {
  const result = parseAttributeSpecifier('{a="}"}}', 0);
  assert.ok(result);
  assert.equal(result.end, 7);
  assert.deepEqual(result.attributes.attrs, { a: "}" });
});

test("diagnostics carry error severity and source offsets", () => {
  const source = "{#ok 9bad=1 .x}";
  const result = parseAttributeSpecifier(source, 0);
  assert.ok(result);
  assert.equal(result.diagnostics.length, 1);
  const [d] = result.diagnostics;
  assert.equal(d.code, AttrCode.BAD_IDENTIFIER);
  assert.equal(d.severity, "error");
  assert.equal(source.slice(d.start, d.end), "9bad");
  assert.deepEqual(result.attributes, { type: "attributes", id: "ok", classes: ["x"], attrs: {} });
});

test("unterminated specifier spans from the brace to end of input", () => {
  const source = "{#a .b";
  const result = parseAttributeSpecifier(source, 0);
  assert.ok(result);
  assert.equal(result.end, source.length);
  assert.deepEqual(result.diagnostics.map((d) => [d.code, d.start, d.end]), [[AttrCode.UNTERMINATED, 0, source.length]]);
});

test("attributes object has no prototype surprises", () => {
  const result = parseAttributeSpecifier("{constructor=x toString=y}", 0);
  assert.ok(result);
  assert.deepEqual(Object.keys(result.attributes.attrs), ["constructor", "toString"]);
  assert.equal(result.attributes.attrs.constructor, "x");
});
