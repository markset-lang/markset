import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  AttrCode,
  AttributeLineCode,
  ConstructCode,
  DirectiveCode,
  FrontmatterCode,
  StructureCode,
} from "@markset-lang/parser";
import { defaultTestsDir } from "../src/harness.ts";

/**
 * The spec names every diagnostic code, the suite pins every code, and the
 * parser reports every code: three lists that agree today because each change
 * has kept them in step by hand. This makes the agreement a guarantee, so a
 * code the spec promises cannot go untested and a code the suite pins cannot
 * go unspecified. Intentset carries the same test over its own specs, which is
 * the point: two closed vocabularies, one discipline.
 */

const root = resolve(import.meta.dirname, "../../..");

/**
 * Codes the spec names that no conformance case can pin, each with its reason.
 * A code here is checked by review rather than by the suite, so the list should
 * stay short and every entry should say why a case cannot exist. Empty today:
 * every code in the spec is reachable from a document.
 */
const REVIEW_ONLY: Record<string, string> = {};

/**
 * Words in the spec that have a code's shape and are not codes. §7 describes
 * the shape itself as `UPPER_SNAKE`.
 */
const NOT_CODES = new Set(["UPPER_SNAKE"]);

const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

async function specCodes(): Promise<Set<string>> {
  const spec = await readFile(join(root, "spec", "v0.md"), "utf8");
  return new Set([...spec.matchAll(CODE)].map((m) => m[0]).filter((word) => !NOT_CODES.has(word)));
}

async function suiteCodes(): Promise<Set<string>> {
  const dir = defaultTestsDir;
  const codes = new Set<string>();
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".json"))) {
    const cases = JSON.parse(await readFile(join(dir, file), "utf8")) as Array<{ diagnostics?: string[] }>;
    for (const c of cases) for (const code of c.diagnostics ?? []) codes.add(code);
  }
  return codes;
}

const parserCodes = new Set<string>(
  [AttrCode, AttributeLineCode, ConstructCode, DirectiveCode, FrontmatterCode, StructureCode].flatMap((codes) =>
    Object.values(codes),
  ),
);

const sorted = (codes: Iterable<string>) => [...codes].sort();

test("the codes the spec names are the suite's codes plus the declared review-only ones", async () => {
  const spec = await specCodes();
  const suite = await suiteCodes();
  assert.ok(spec.size >= 40, `found only ${spec.size} codes in spec/v0.md; the pattern no longer matches`);
  for (const code of Object.keys(REVIEW_ONLY)) {
    assert.ok(spec.has(code), `${code} is declared review-only but the spec does not name it`);
    assert.ok(!suite.has(code), `${code} is declared review-only but a case pins it; take it off the list`);
  }
  assert.deepEqual(sorted(spec), sorted([...suite, ...Object.keys(REVIEW_ONLY)]));
});

test("the codes the parser reports are the codes the spec names", async () => {
  assert.deepEqual(sorted(parserCodes), sorted(await specCodes()));
});

test("every word set aside as not a code is still in the spec", async () => {
  const spec = await readFile(join(root, "spec", "v0.md"), "utf8");
  for (const word of NOT_CODES) assert.ok(spec.includes(word), `${word} is no longer in the spec; drop it here`);
});
