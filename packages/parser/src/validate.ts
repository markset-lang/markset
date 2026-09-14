/**
 * Structural checks that need the whole tree rather than one line: separator
 * placement (§2.4) and stray closing fences (§2.3).
 */
import type { Nodes, Root } from "mdast";
import type { Diagnostic } from "./diagnostics.ts";
import { DirectiveCode } from "./directives.ts";

export const StructureCode = {
  SEPARATOR_OUTSIDE_PARENT: "SEPARATOR_OUTSIDE_PARENT",
} as const;

const STRAY_FENCE = /^[ \t]*:{3,}[ \t]*$/m;

export function validateStructure(tree: Root): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  walk(tree, null);
  return diagnostics;

  function walk(node: Nodes, parent: Nodes | null): void {
    if (node.type === "separator") {
      const inColumns = parent?.type === "directive" && parent.name === "columns";
      if (!inColumns) {
        diagnostics.push({
          code: StructureCode.SEPARATOR_OUTSIDE_PARENT,
          severity: "error",
          message: `"::${node.name}" is only valid directly inside ":::columns"`,
          ...span(node),
        });
      }
    }
    if (node.type === "paragraph") {
      for (const child of node.children) {
        if (child.type === "text" && STRAY_FENCE.test(child.value)) {
          diagnostics.push({
            code: DirectiveCode.STRAY_FENCE,
            severity: "warning",
            message: "a line of colons with no open directive is ordinary text; check the fence lengths",
            ...span(child),
          });
        }
      }
    }
    if ("children" in node) {
      for (const child of node.children) walk(child as Nodes, node);
    }
  }
}

function span(node: Nodes): { start: number; end: number } {
  return { start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0 };
}
