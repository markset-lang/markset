/**
 * The Markset conformance cases, as data.
 *
 * This package carries no parser, no renderer and no opinion about how an
 * implementation is built. It is the suite an implementation is checked
 * against, distributed so that checking does not require cloning the
 * reference implementation's repository.
 *
 * The cases are JSON, and JSON is the artifact: an implementation in any
 * language reads `cases/*.json` and `schema.json` straight off disk. The
 * functions here are a convenience for JavaScript consumers, not the format.
 *
 * What is normative, and what is only reference output, is spec §7. In short:
 * `valid`, `diagnostics` and `ast` must match exactly; `html` and `downgrade`
 * are the reference implementation's own output and a conforming renderer has
 * to be equivalent to them rather than byte-identical.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** One case. The fields are spec §7; the schema is the normative definition. */
export interface ConformanceCase {
  /** Section identifier, equal to the file's basename. */
  section: string;
  /** Optional human label, used in harness reports. */
  name?: string;
  /** Input source: a full document, or a bare fragment in the grammar sections. */
  markset: string;
  /** Reference HTML output. Equivalence is required, not byte-identity. */
  html?: string;
  /** Reference CommonMark output. Equivalence is required, not byte-identity. */
  downgrade?: string;
  /** Expected AST, compared structurally with position fields removed. */
  ast?: unknown;
  /** False when the parser must emit at least one error-severity diagnostic. */
  valid: boolean;
  /** Every diagnostic code the parser must emit, in any order. */
  diagnostics?: string[];
}

/** Where the packaged cases live. Pass another directory to read a checkout's `tests/`. */
export const casesDir: string = resolve(import.meta.dirname, "..", "cases");

/** The normative JSON Schema for a case file (spec §7). */
export const schemaPath: string = resolve(import.meta.dirname, "..", "schema.json");

/** Section names, sorted, as the file basenames. */
export function sections(dir: string = casesDir): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

/** Every case in one section, in file order. */
export function loadSection(section: string, dir: string = casesDir): ConformanceCase[] {
  return JSON.parse(readFileSync(join(dir, `${section}.json`), "utf8")) as ConformanceCase[];
}

/** Every case in every section, in section order. */
export function loadCases(dir: string = casesDir): ConformanceCase[] {
  return sections(dir).flatMap((section) => loadSection(section, dir));
}
