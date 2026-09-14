import type { Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import { frontmatter } from "micromark-extension-frontmatter";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { markset } from "./syntax.ts";
import { marksetFromMarkdown } from "./from-markdown.ts";
import { validateStructure } from "./validate.ts";
import { normalizeConstructs } from "./constructs.ts";
import { readFrontmatter, type Frontmatter } from "./frontmatter.ts";
import type { Diagnostic } from "./diagnostics.ts";

export interface ParsedDocument {
  ast: Root;
  /** Parsed §6 frontmatter, or null when the document has none. */
  frontmatter: Frontmatter | null;
  /** Sorted by start offset. */
  diagnostics: Diagnostic[];
}

/**
 * Parse a Markset document into an mdast tree extended with the §4 construct
 * nodes (`card`, `grid`, `callout`, ...), `span` nodes, and, for directives
 * that fail validation, generic `directive` nodes. Every valid CommonMark
 * document parses to the same tree mdast-util-from-markdown would produce,
 * plus GFM tables.
 */
export function parseDocument(source: string): ParsedDocument {
  const diagnostics: Diagnostic[] = [];
  const ast = fromMarkdown(source, {
    extensions: [markset(), gfmTable(), frontmatter(["yaml"])],
    mdastExtensions: [marksetFromMarkdown(diagnostics), gfmTableFromMarkdown(), frontmatterFromMarkdown(["yaml"])],
  });
  const first = ast.children[0];
  const meta = first?.type === "yaml" ? readFrontmatter(first, diagnostics) : null;
  if (meta) ast.frontmatter = meta;
  diagnostics.push(...validateStructure(ast, source));
  normalizeConstructs(ast, source, diagnostics);
  diagnostics.sort((a, b) => a.start - b.start || a.end - b.end);
  return { ast, frontmatter: meta, diagnostics };
}
