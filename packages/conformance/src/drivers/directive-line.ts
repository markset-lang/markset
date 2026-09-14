import { parseDirectiveLine } from "@markset/parser";
import type { Driver } from "../types.ts";

/**
 * Grammar sections §2.3 and §2.4. `markset` is one line without its newline.
 * An expected `ast` of null asserts the line is ordinary text.
 */
export const directiveLineDriver: Driver = (testCase) => {
  const source = testCase.markset;
  if (source.includes("\n")) {
    return { valid: false, diagnostics: [], problems: ["line fragments must not contain a newline"] };
  }

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
