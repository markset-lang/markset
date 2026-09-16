import { parseDirectiveLine } from "@markset-lang/parser";
import type { Driver } from "../types.ts";
import { documentDriver } from "./document.ts";

/**
 * Grammar sections §2.3 and §2.4. A `markset` without a newline is one fence
 * or separator line; an expected `ast` of null asserts it is ordinary text.
 * A `markset` with a newline is a full document exercising block structure.
 */
export const directiveLineDriver: Driver = (testCase) => {
  const source = testCase.markset;
  if (source.includes("\n")) return documentDriver(testCase);

  const result = parseDirectiveLine(source);
  if (result === null) {
    return { valid: true, diagnostics: [], ast: null };
  }
  return {
    valid: !result.diagnostics.some((d) => d.severity === "error"),
    diagnostics: result.diagnostics.map((d) => d.code),
    ast: result.line,
  };
};
