import { parseDocument } from "@markset/parser";
import { renderDowngrade } from "@markset/render-downgrade";
import { renderHtml } from "@markset/render-html";
import type { Driver } from "../types.ts";
import { stripPositions } from "../strip.ts";
import { checkNaive } from "../naive.ts";

/** Full-document driver: `markset` is a whole document, `ast` the mdast tree without positions. */
export const documentDriver: Driver = (testCase) => {
  const { ast, diagnostics } = parseDocument(testCase.markset);
  // The naive contract is checked unless the case is documenting a known degradation warning.
  const expectsDegradation = (testCase.diagnostics ?? []).some((code) => code.startsWith("DEGRADATION_"));
  return {
    naive: expectsDegradation ? undefined : checkNaive(testCase.markset, ast),
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics: diagnostics.map((d) => d.code),
    ast: stripPositions(ast),
    downgrade: renderDowngrade(ast),
    // Diagrams are left undrawn (§10). The reference implementation draws
    // `ascii` by default, but a drawn diagram is an implementation's own SVG:
    // a second implementation could not reproduce it byte for byte, and §10
    // obligation 1 makes the undrawn code block the form every conformant
    // renderer agrees on. So that is what the html aspect pins.
    html: renderHtml(ast, { diagrams: false }),
  };
};
