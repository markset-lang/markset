/**
 * Structural checks that need the whole tree rather than one line: separator
 * placement (§2.4) and stray closing fences (§2.3).
 */
import type { Nodes, Root } from "mdast";
import type { Diagnostic } from "./diagnostics.ts";
import { DirectiveCode } from "./directives.ts";

export const StructureCode = {
  SEPARATOR_OUTSIDE_PARENT: "SEPARATOR_OUTSIDE_PARENT",
  /** Warning: the first content block would merge into the fence line under a stock CommonMark parser (§3). */
  DEGRADATION_BLANK_LINE: "DEGRADATION_BLANK_LINE",
  /** Warning: a reserved class (§5) used on a node type outside its "Applies to" column. */
  CLASS_MISAPPLIED: "CLASS_MISAPPLIED",
} as const;

/** Reserved classes with restricted placement (§5). Classes absent here apply anywhere. */
const RESERVED_PLACEMENT: Record<string, ReadonlySet<string>> = {
  lead: new Set(["paragraph"]),
  eyebrow: new Set(["paragraph"]),
  small: new Set(["paragraph", "span"]),
  badge: new Set(["span"]),
};

const STRAY_FENCE = /^[ \t]*:{3,}[ \t]*$/m;

export function validateStructure(tree: Root, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  walk(tree, null);
  return diagnostics;

  function walk(node: Nodes, parent: Nodes | null): void {
    if (node.type === "directive") checkNaiveDegradation(node);
    checkReservedClasses(node);
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

  function checkReservedClasses(node: Nodes): void {
    const attributes = (node as { attributes?: { classes: string[] } }).attributes;
    if (!attributes) return;
    // Blockquote-syntax callouts and directives carry attributes too, but §5 restricts by rendered element.
    const kind = node.type === "blockquote" || node.type === "callout" ? "blockquote" : node.type;
    for (const name of attributes.classes) {
      const allowed = RESERVED_PLACEMENT[name];
      if (allowed && !allowed.has(kind)) {
        diagnostics.push({
          code: StructureCode.CLASS_MISAPPLIED,
          severity: "warning",
          message: `.${name} applies to ${[...allowed].join(" or ")}, not to a ${kind}; it is kept but themes may ignore it`,
          ...span(node),
        });
      }
    }
  }

  /**
   * A stock CommonMark parser reads the opening fence as a paragraph. Blocks
   * that can interrupt a paragraph (bullet lists, lists starting at 1, fenced
   * code, ATX headings, tables, blockquotes) survive; these three do not.
   */
  function checkNaiveDegradation(node: Nodes & { children: Nodes[] }): void {
    const first = node.children[0];
    if (!first?.position || !node.position) return;
    if (first.position.start.line !== node.position.start.line + 1) return;
    const text = source.slice(first.position.start.offset, first.position.end.offset);
    let what: string | null = null;
    if (first.type === "list" && first.ordered && first.start !== null && first.start !== 1) {
      what = `an ordered list starting at ${first.start}`;
    } else if (first.type === "code" && !/^[`~]/.test(text)) {
      what = "an indented code block";
    } else if (first.type === "heading" && !text.startsWith("#")) {
      what = "a setext heading";
    }
    if (what) {
      diagnostics.push({
        code: StructureCode.DEGRADATION_BLANK_LINE,
        severity: "warning",
        message: `${what} directly after the opening fence is swallowed by plain CommonMark renderers; add a blank line after the fence`,
        ...span(first),
      });
    }
  }
}

function span(node: Nodes): { start: number; end: number } {
  return { start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0 };
}
