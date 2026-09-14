import { test } from "node:test";
import assert from "node:assert/strict";
import { deepEqual, firstDifference, sameCodes } from "../src/compare.ts";

test("object key order is ignored", () => {
  assert.equal(firstDifference({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), null);
});

test("array order is significant", () => {
  assert.equal(firstDifference({ c: ["a", "b"] }, { c: ["b", "a"] }), '$.c[0]: expected "a", got "b"');
});

test("reports the first differing path", () => {
  assert.equal(firstDifference({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }), "$.a.b.c: expected 1, got 2");
  assert.equal(firstDifference({ a: 1 }, { a: 1, extra: true }), "$.extra: unexpected true");
  assert.equal(firstDifference({ a: 1 }, {}), "$.a: expected 1, got <absent>");
  assert.equal(firstDifference([1], [1, 2]), "$: expected 1 item(s), got 2");
  assert.equal(firstDifference(null, {}), "$: expected null, got {}");
});

test("deepEqual distinguishes null from absent", () => {
  assert.ok(deepEqual({ id: null }, { id: null }));
  assert.ok(!deepEqual({ id: null }, {}));
});

test("sameCodes is an order-insensitive multiset", () => {
  assert.ok(sameCodes(["B", "A"], ["A", "B"]));
  assert.ok(!sameCodes(["A"], ["A", "A"]));
  assert.ok(sameCodes([], []));
});
