import type { SchemaError } from "./schema.ts";

/** One entry in a tests/<section>.json file. Shape is governed by spec/conformance.schema.json. */
export interface ConformanceCase {
  section: string;
  name?: string;
  markset: string;
  html?: string;
  downgrade?: string;
  ast?: unknown;
  valid: boolean;
  diagnostics?: string[];
}

/**
 * What a section driver observed for one case. Fields left undefined are
 * reported as skipped rather than failed, so cases can be written ahead of
 * the code that satisfies them.
 */
export interface Actual {
  valid: boolean;
  /** Diagnostic codes emitted, errors and warnings alike. */
  diagnostics: string[];
  ast?: unknown;
  html?: string;
  downgrade?: string;
  /** Driver-level failures that are not tied to an expected field, e.g. unconsumed input. */
  problems?: string[];
}

export type Driver = (testCase: ConformanceCase) => Actual;

export type Aspect = "valid" | "diagnostics" | "ast" | "html" | "downgrade" | "driver";
export type Status = "pass" | "fail" | "skip";

export interface AspectResult {
  aspect: Aspect;
  status: Status;
  detail?: string;
}

export interface CaseResult {
  index: number;
  name: string;
  aspects: AspectResult[];
}

export interface FileResult {
  file: string;
  section: string;
  /** Problems with the file itself: unreadable, invalid JSON, schema violations, section mismatch. */
  fileErrors: string[];
  schemaErrors: SchemaError[];
  cases: CaseResult[];
}

export interface Totals {
  pass: number;
  fail: number;
  skip: number;
}

export interface SuiteResult {
  files: FileResult[];
  totals: Totals;
}
