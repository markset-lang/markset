import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validate, type Schema } from "../src/schema.ts";
import { defaultSchemaPath } from "../src/harness.ts";

const schema = JSON.parse(await readFile(defaultSchemaPath, "utf8")) as Schema;

const validCase = {
  section: "grid",
  markset: ":::grid\n- One\n:::\n",
  html: "<div></div>\n",
  downgrade: "- One\n",
  ast: { type: "grid" },
  valid: true,
};

test("accepts a well-formed valid case", () => {
  assert.deepEqual(validate(schema, [validCase]), []);
});

test("accepts a grammar case with no html or downgrade", () => {
  const grammar = { section: "attribute-specifier", markset: "{#a}", ast: {}, valid: true };
  assert.deepEqual(validate(schema, [grammar]), []);
});

test("rejects a non-array file", () => {
  const errors = validate(schema, validCase);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /expected array/);
});

test("valid cases must carry an ast", () => {
  const { ast: _omitted, ...withoutAst } = validCase;
  const errors = validate(schema, [withoutAst]);
  assert.deepEqual(
    errors.map((e) => e.message),
    ['missing required property "ast"'],
  );
});

test("invalid cases must carry at least one diagnostic", () => {
  const missing = validate(schema, [{ ...validCase, valid: false }]);
  assert.ok(missing.some((e) => e.message.includes('"diagnostics"')));

  const empty = validate(schema, [{ ...validCase, valid: false, diagnostics: [] }]);
  assert.ok(empty.some((e) => e.message.includes("at least 1")));

  const ok = validate(schema, [{ ...validCase, valid: false, diagnostics: ["GRID_NOT_A_LIST"] }]);
  assert.deepEqual(ok, []);
});

test("diagnostic codes are UPPER_SNAKE with an area prefix", () => {
  for (const bad of ["lowercase", "NOPREFIX", "ATTR-BAD", "ATTR_"]) {
    const errors = validate(schema, [{ ...validCase, valid: false, diagnostics: [bad] }]);
    assert.ok(errors.length > 0, `expected "${bad}" to be rejected`);
    assert.equal(errors[0].path, "$[0].diagnostics[0]");
  }
});

test("unknown properties are rejected with their path", () => {
  const errors = validate(schema, [{ ...validCase, extra: 1 }]);
  assert.deepEqual(errors, [{ path: "$[0].extra", message: "unexpected property" }]);
});

test("section names are lowercase kebab", () => {
  const errors = validate(schema, [{ ...validCase, section: "Grid" }]);
  assert.equal(errors[0].path, "$[0].section");
});

test("validator handles the generic keywords it advertises", () => {
  const local: Schema = {
    type: "object",
    properties: {
      kind: { enum: ["a", "b"] },
      n: { type: "integer" },
      tags: { type: "array", items: { type: "string" }, minItems: 1 },
    },
    if: { properties: { kind: { const: "a" } } },
    // biome-ignore lint/suspicious/noThenProperty: `then` is a JSON Schema keyword here, not a thenable.
    then: { required: ["n"] },
    else: { not: { required: ["n"] } },
  };
  assert.deepEqual(validate(local, { kind: "a", n: 1, tags: ["x"] }), []);
  assert.ok(validate(local, { kind: "a", tags: ["x"] }).length > 0, "then branch enforces n");
  assert.ok(validate(local, { kind: "b", n: 1 }).length > 0, "else branch forbids n");
  assert.ok(validate(local, { kind: "c" }).length > 0, "enum rejects c");
  assert.ok(validate(local, { kind: "b", n: 1.5 }).length > 0, "integer rejects 1.5");
  assert.ok(validate(local, { kind: "b", tags: [] }).length > 0, "minItems rejects empty");
});
