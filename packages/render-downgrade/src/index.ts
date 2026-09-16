import type { Root } from "mdast";
import { toMarkdown, type Options } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { parseDocument, type Diagnostic } from "@markset-lang/parser";
import { downgradeTree } from "./transform.ts";

export { downgradeTree };

/** Serialization choices are fixed so the conformance suite can pin output byte for byte. */
const options: Options = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fences: true,
  rule: "-",
  listItemIndent: "one",
  extensions: [gfmTableToMarkdown(), frontmatterToMarkdown(["yaml"])],
};

/** Render a parsed Markset tree as plain CommonMark. */
export function renderDowngrade(tree: Root): string {
  return toMarkdown(downgradeTree(tree), options);
}

/** Parse and downgrade in one step. Diagnostics are returned, not thrown; invalid documents still render. */
export function downgrade(source: string): { markdown: string; diagnostics: Diagnostic[] } {
  const { ast, diagnostics } = parseDocument(source);
  return { markdown: renderDowngrade(ast), diagnostics };
}
