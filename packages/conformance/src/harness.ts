import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { validate, type Schema } from "./schema.ts";
import { firstDifference, sameCodes } from "./compare.ts";
import type {
  Actual, AspectResult, CaseResult, ConformanceCase, Driver, FileResult, SuiteResult, Totals,
} from "./types.ts";

/** Repository root, derived from this file's location: packages/conformance/src -> root. */
export const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
export const defaultTestsDir = join(repoRoot, "tests");
export const defaultSchemaPath = join(repoRoot, "spec", "conformance.schema.json");

export interface SuiteOptions {
  drivers: Record<string, Driver>;
  testsDir?: string;
  schemaPath?: string;
  /** Restrict the run to one section (file basename). */
  section?: string;
}

export async function runSuite(options: SuiteOptions): Promise<SuiteResult> {
  const testsDir = options.testsDir ?? defaultTestsDir;
  const schemaPath = options.schemaPath ?? defaultSchemaPath;
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Schema;

  const names = (await readdir(testsDir))
    .filter((name) => name.endsWith(".json"))
    .filter((name) => options.section === undefined || basename(name, ".json") === options.section)
    .sort();

  const files: FileResult[] = [];
  for (const name of names) {
    files.push(await runFile(join(testsDir, name), schema, options.drivers));
  }
  return { files, totals: tally(files) };
}

async function runFile(path: string, schema: Schema, drivers: Record<string, Driver>): Promise<FileResult> {
  const section = basename(path, ".json");
  const result: FileResult = { file: path, section, fileErrors: [], schemaErrors: [], cases: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    result.fileErrors.push(`could not read as JSON: ${(error as Error).message}`);
    return result;
  }

  result.schemaErrors = validate(schema, parsed);
  if (result.schemaErrors.length > 0) return result;

  const cases = parsed as ConformanceCase[];
  cases.forEach((testCase, index) => {
    if (testCase.section !== section) {
      result.fileErrors.push(`case ${index + 1} declares section "${testCase.section}" but lives in ${section}.json`);
    }
  });
  if (result.fileErrors.length > 0) return result;

  const driver = drivers[section];
  result.cases = cases.map((testCase, index) => runCase(testCase, index + 1, driver));
  return result;
}

export function runCase(testCase: ConformanceCase, index: number, driver: Driver | undefined): CaseResult {
  const name = testCase.name ?? `case ${index}`;
  if (!driver) {
    return { index, name, aspects: [{ aspect: "driver", status: "skip", detail: `no driver for section "${testCase.section}"` }] };
  }

  let actual: Actual;
  try {
    actual = driver(testCase);
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    return { index, name, aspects: [{ aspect: "driver", status: "fail", detail: `driver threw: ${message}` }] };
  }

  return { index, name, aspects: compareCase(testCase, actual) };
}

export function compareCase(expected: ConformanceCase, actual: Actual): AspectResult[] {
  const aspects: AspectResult[] = [];

  for (const problem of actual.problems ?? []) {
    aspects.push({ aspect: "driver", status: "fail", detail: problem });
  }

  aspects.push(
    expected.valid === actual.valid
      ? { aspect: "valid", status: "pass" }
      : { aspect: "valid", status: "fail", detail: `expected valid=${expected.valid}, got ${actual.valid}` },
  );

  const expectedCodes = expected.diagnostics ?? [];
  aspects.push(
    sameCodes(expectedCodes, actual.diagnostics)
      ? { aspect: "diagnostics", status: "pass" }
      : {
          aspect: "diagnostics",
          status: "fail",
          detail: `expected [${expectedCodes.join(", ")}], got [${actual.diagnostics.join(", ")}]`,
        },
  );

  if (expected.ast !== undefined) {
    if (actual.ast === undefined) {
      aspects.push({ aspect: "ast", status: "skip", detail: "driver produced no AST" });
    } else {
      const diff = firstDifference(expected.ast, actual.ast);
      aspects.push(diff ? { aspect: "ast", status: "fail", detail: diff } : { aspect: "ast", status: "pass" });
    }
  }

  for (const aspect of ["html", "downgrade"] as const) {
    if (expected[aspect] === undefined) continue;
    const got = actual[aspect];
    if (got === undefined) {
      aspects.push({ aspect, status: "skip", detail: `no ${aspect} renderer yet` });
    } else if (got === expected[aspect]) {
      aspects.push({ aspect, status: "pass" });
    } else {
      aspects.push({ aspect, status: "fail", detail: `expected ${JSON.stringify(expected[aspect])}, got ${JSON.stringify(got)}` });
    }
  }

  if (actual.naive) {
    aspects.push(actual.naive.pass
      ? { aspect: "naive", status: "pass" }
      : { aspect: "naive", status: "fail", detail: actual.naive.detail ?? "naive output lost or reordered content" });
  }

  return aspects;
}

export function tally(files: FileResult[]): Totals {
  const totals: Totals = { pass: 0, fail: 0, skip: 0 };
  for (const file of files) {
    for (const testCase of file.cases) {
      for (const aspect of testCase.aspects) totals[aspect.status]++;
    }
  }
  return totals;
}

/** True when nothing failed and every file was well-formed. Skips do not count against the suite. */
export function suitePassed(result: SuiteResult): boolean {
  return result.totals.fail === 0
    && result.files.every((file) => file.fileErrors.length === 0 && file.schemaErrors.length === 0);
}
