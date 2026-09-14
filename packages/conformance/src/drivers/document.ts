import { parseDocument } from "@markset/parser";
import { renderDowngrade } from "@markset/render-downgrade";
import type { Driver } from "../types.ts";
import { stripPositions } from "../strip.ts";

/** Full-document driver: `markset` is a whole document, `ast` the mdast tree without positions. */
export const documentDriver: Driver = (testCase) => {
  const { ast, diagnostics } = parseDocument(testCase.markset);
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics: diagnostics.map((d) => d.code),
    ast: stripPositions(ast),
    downgrade: renderDowngrade(ast),
  };
};
