import { parseAttributeSpecifier } from "@markset/parser";
import type { Driver } from "../types.ts";

/**
 * Grammar section §2.1. `markset` holds the bare specifier, which the parser
 * must consume completely. There is no html or downgrade for a fragment.
 */
export const attributeSpecifierDriver: Driver = (testCase) => {
  const source = testCase.markset;
  const result = parseAttributeSpecifier(source, 0);
  if (result === null) {
    return { valid: false, diagnostics: [], problems: ["input does not begin with '{'"] };
  }

  const problems: string[] = [];
  if (result.end !== source.length) {
    problems.push(`parser consumed ${result.end} of ${source.length} characters`);
  }

  return {
    valid: !result.diagnostics.some((d) => d.severity === "error"),
    diagnostics: result.diagnostics.map((d) => d.code),
    ast: result.attributes,
    problems,
  };
};
