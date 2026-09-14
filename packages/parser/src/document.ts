import type { Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { markset } from "./syntax.ts";
import { marksetFromMarkdown } from "./from-markdown.ts";
import { validateStructure } from "./validate.ts";
import type { Diagnostic } from "./diagnostics.ts";

export interface ParsedDocument {
  ast: Root;
  /** Sorted by start offset. */
  diagnostics: Diagnostic[];
}

/**
 * Parse a Markset document into an mdast tree with generic `directive`,
 * `separator`, and `span` nodes (spec §2). Construct normalization (§4) is a
 * later pass. Every valid CommonMark document parses to the same tree
 * mdast-util-from-markdown would produce, plus GFM tables.
 */
export function parseDocument(source: string): ParsedDocument {
  const diagnostics: Diagnostic[] = [];
  const ast = fromMarkdown(source, {
    extensions: [markset(), gfmTable()],
    mdastExtensions: [marksetFromMarkdown(diagnostics), gfmTableFromMarkdown()],
  });
  diagnostics.push(...validateStructure(ast));
  diagnostics.sort((a, b) => a.start - b.start || a.end - b.end);
  return { ast, diagnostics };
}
