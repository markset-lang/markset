import { relative } from "node:path";
import { repoRoot } from "./harness.ts";
import type { FileResult, SuiteResult } from "./types.ts";

export interface ReportOptions {
  /** Also list passing cases, not just failures and skips. */
  verbose?: boolean;
}

export function formatReport(result: SuiteResult, options: ReportOptions = {}): string {
  const lines: string[] = [];
  for (const file of result.files) lines.push(...formatFile(file, options));
  const { pass, fail, skip } = result.totals;
  lines.push("");
  lines.push(`aspects: ${pass} passed, ${fail} failed, ${skip} skipped`);
  return lines.join("\n");
}

function formatFile(file: FileResult, options: ReportOptions): string[] {
  const lines: string[] = [];
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const testCase of file.cases) for (const aspect of testCase.aspects) counts[aspect.status]++;

  const location = relative(repoRoot, file.file);
  lines.push(
    `${file.section}  (${location})  ${file.cases.length} case(s)  pass ${counts.pass}  fail ${counts.fail}  skip ${counts.skip}`,
  );

  for (const error of file.fileErrors) lines.push(`  ! ${error}`);
  for (const error of file.schemaErrors) lines.push(`  ! schema ${error.path}: ${error.message}`);

  for (const testCase of file.cases) {
    const failed = testCase.aspects.filter((a) => a.status === "fail");
    const skipped = testCase.aspects.filter((a) => a.status === "skip");
    if (failed.length === 0 && skipped.length === 0 && !options.verbose) continue;

    const mark = failed.length > 0 ? "✗" : skipped.length > 0 ? "○" : "✓";
    lines.push(`  ${mark} #${testCase.index} ${testCase.name}`);
    for (const aspect of failed) lines.push(`      ${aspect.aspect}: ${aspect.detail ?? "failed"}`);
    for (const aspect of skipped) lines.push(`      ${aspect.aspect}: skipped (${aspect.detail ?? "no reason given"})`);
  }
  return lines;
}
