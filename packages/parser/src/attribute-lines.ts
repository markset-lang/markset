/**
 * Attach attribute lines (spec §2.5) to the block that starts on the next
 * line, then remove them from the tree. Runs before structure validation
 * and construct normalization, so directives are still generic here.
 */
import type { Nodes, Root } from "mdast";
import type { Attributes } from "./attributes.ts";
import type { AttributeLine } from "./ast.ts";
import type { Diagnostic } from "./diagnostics.ts";

export const AttributeLineCode = {
  ORPHAN: "ATTR_LINE_ORPHAN",
  ON_DIRECTIVE: "ATTR_LINE_ON_DIRECTIVE",
  /** Warning: `---` after an attribute line is a setext heading to plain CommonMark (§3). */
  DEGRADATION_SETEXT_RULE: "DEGRADATION_SETEXT_RULE",
} as const;

type Attributable = Nodes & { attributes?: Attributes };

export function attachAttributeLines(tree: Root, source: string, diagnostics: Diagnostic[]): void {
  visit(tree);

  function visit(node: Nodes): void {
    if (!("children" in node)) return;
    const parent = node as { children: Nodes[] };
    const out: Nodes[] = [];
    let pending: AttributeLine[] = [];
    let children = parent.children;

    // A list item has no line of its own before its content, so attribute
    // lines that open the item describe the item itself (§2.5).
    if (node.type === "listItem") {
      let lead = 0;
      while (lead < children.length && children[lead].type === "attributeLine") lead++;
      if (lead > 0) {
        (node as Attributable).attributes = merge(children.slice(0, lead) as AttributeLine[]);
        children = children.slice(lead);
      }
    }

    for (const child of children) {
      if (child.type === "attributeLine") {
        pending.push(child);
        continue;
      }
      if (pending.length > 0) {
        attach(pending, child);
        pending = [];
      }
      visit(child);
      out.push(child);
    }
    for (const line of pending) orphan(line);
    parent.children = out;
  }

  function attach(lines: AttributeLine[], target: Nodes): void {
    const last = lines[lines.length - 1];
    const adjacent = last.position && target.position && target.position.start.line === last.position.end.line + 1;
    if (!adjacent) {
      for (const line of lines) orphan(line);
      return;
    }
    if (target.type === "directive" || target.type === "separator") {
      const what = target.type === "directive" ? "a directive" : "a separator";
      for (const line of lines) {
        diagnostics.push({
          code: AttributeLineCode.ON_DIRECTIVE,
          severity: "error",
          message: `an attribute line cannot apply to ${what}; put the attributes in its own specifier`,
          ...span(line),
        });
      }
      return;
    }
    if (target.type === "thematicBreak" && source[target.position?.start.offset ?? -1] === "-") {
      diagnostics.push({
        code: AttributeLineCode.DEGRADATION_SETEXT_RULE,
        severity: "warning",
        message:
          "a `---` rule directly after an attribute line reads as a setext heading in plain CommonMark renderers; write the rule as `***`",
        ...span(target),
      });
    }
    (target as Attributable).attributes = merge(lines);
  }

  function merge(lines: AttributeLine[]): Attributes {
    const merged: Attributes = { type: "attributes", id: null, classes: [], attrs: {} };
    for (const line of lines) {
      if (line.attributes.id !== null) merged.id = line.attributes.id;
      merged.classes.push(...line.attributes.classes);
      Object.assign(merged.attrs, line.attributes.attrs);
    }
    return merged;
  }

  function orphan(line: AttributeLine): void {
    diagnostics.push({
      code: AttributeLineCode.ORPHAN,
      severity: "error",
      message: "attribute line applies to nothing; the block it describes must start on the next line",
      ...span(line),
    });
  }
}

function span(node: Nodes): { start: number; end: number } {
  return { start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0 };
}
