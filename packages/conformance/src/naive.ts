/**
 * The §3 "naive output" contract: a stock CommonMark parser (here micromark
 * with GFM tables and frontmatter, as GitHub renders) must keep every content
 * block of a Markset document, with its type, in source order. Fence lines
 * becoming visible text is allowed; a list turning into a paragraph is not.
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { frontmatter } from "micromark-extension-frontmatter";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import type { Nodes, Root } from "mdast";

/** Block types whose survival the contract guarantees. Paragraphs are excluded: fence lines merge into them by design. */
const TRACKED = new Set(["list", "table", "code", "heading", "blockquote", "thematicBreak", "yaml", "html"]);

export function checkNaive(source: string, marksetTree: Root): { pass: boolean; detail?: string } {
  const naiveTree = fromMarkdown(source, {
    extensions: [gfmTable(), frontmatter(["yaml"])],
    mdastExtensions: [gfmTableFromMarkdown(), frontmatterFromMarkdown(["yaml"])],
  });
  const expected = blockSequence(marksetTree);
  const actual = blockSequence(naiveTree);
  if (expected.join(",") === actual.join(",")) return { pass: true };
  return { pass: false, detail: `content blocks [${expected.join(", ")}] became [${actual.join(", ")}] under plain CommonMark` };
}

/** Flatten a tree to the sequence of tracked block types, seeing through Markset constructs. */
export function blockSequence(tree: Nodes): string[] {
  const out: string[] = [];
  visit(tree);
  return out;

  function visit(node: Nodes): void {
    switch (node.type) {
      case "callout":
        out.push("blockquote");
        for (const child of node.children) visit(child);
        return;
      case "tabs":
        for (const tab of node.children) {
          out.push("heading");
          for (const child of tab.children) visit(child);
        }
        return;
      case "grid":
      case "steps":
      case "metrics":
      case "figure":
      case "card":
      case "columns":
      case "column":
      case "directive":
      case "root":
      case "listItem":
        for (const child of node.children) visit(child as Nodes);
        return;
      default:
        if (TRACKED.has(node.type)) {
          out.push(node.type);
          // Blockquotes and lists are CommonMark-native containers; their content survives with them.
          if (node.type === "list" && "children" in node) for (const item of node.children) visit(item);
          if (node.type === "blockquote") for (const child of node.children) visit(child);
        }
    }
  }
}
