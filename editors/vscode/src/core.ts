/**
 * The parts of the extension that are not VS Code.
 *
 * Everything here is a pure function over strings and trees, so it can be
 * tested with node alone -- the editor glue in extension.ts is thin on purpose,
 * because it is the part no test in this repository can run.
 */
import { parseDocument, type Diagnostic } from "@markset-lang/parser";
import { bodyAttributes, renderHtml } from "@markset-lang/render-html";
import { BLURB, CONSTRUCTS, selectSnippet } from "../../../site/playground/vocabulary.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

/**
 * Whether a document says it is Markset.
 *
 * A `markset:` line in frontmatter names the specification version a document
 * is written against -- `markset: 0` for v0 -- and spec §6 makes it the
 * recommended trigger for treating a file as Markset. It is a version, not a
 * switch: zero is the zeroth spec, not off. It is also the only honest trigger
 * an editor has: every Markdown file is a valid Markset document, but a reader
 * whose `:::` means something else does not want to hear about a closed
 * vocabulary they never opted into. Any
 * `markset:` key counts, including a wrong version, so the diagnostic for the
 * wrong version can be shown.
 */
export function declaresMarkset(source: string): boolean {
  const block = FRONTMATTER.exec(source);
  return block !== null && /^markset\s*:/mu.test(block[1]);
}

export function shouldCheck(source: string, checkAllMarkdown: boolean): boolean {
  return checkAllMarkdown || declaresMarkset(source);
}

/** Every diagnostic the parser reports, with character offsets the editor turns into positions. */
export function check(source: string): Diagnostic[] {
  return parseDocument(source).diagnostics;
}

export type Scheme = "light" | "dark";

/**
 * The preview page.
 *
 * The same shape as the playground's preview and the CLI's page: the default
 * stylesheet, then a theme if one is configured, then the rendered document.
 * The content security policy allows inline styles and data-URI images -- a
 * drawn ASCII diagram is one -- and nothing else, so even if a renderer defect
 * ever emitted a script it could not run. The webview is also created with
 * scripting off; the policy is the second lock on the same door.
 */
export function previewDocument(source: string, stylesheet: string, theme: string | null, scheme: Scheme): string {
  const { ast } = parseDocument(source);
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
  const themeTag = theme ? `<style>\n${theme}\n</style>\n` : "";
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<style>\n${stylesheet}\n</style>\n${themeTag}</head>\n` +
    `<body${bodyAttributes(ast.frontmatter ?? null)} data-scheme="${scheme}">\n` +
    `<main class="ms-document">\n${renderHtml(ast)}</main>\n</body>\n</html>\n`
  );
}

export interface SnippetCase {
  name?: string;
  valid: boolean;
  markset: string;
}

export interface Snippet {
  prefix: string;
  body: string[];
  description: string;
}

/** What a `$` or `\` in a case has to become so VS Code inserts it literally. */
export function escapeSnippetBody(text: string): string {
  return text.replace(/\\/gu, "\\\\").replace(/\$/gu, "\\$");
}

/** The inverse, for the test that parses every body. */
export function unescapeSnippetBody(text: string): string {
  return text.replace(/\\\$/gu, "$").replace(/\\\\/gu, "\\");
}

/**
 * The snippets file, derived the way the playground's palette is: one entry per
 * construct plus the two kinds of picture, each body a case from the conformance
 * suite chosen by the same rule. Nothing here is a list someone maintains, so a
 * snippet cannot offer a construct the parser rejects or text the suite has not
 * run.
 */
export function buildSnippets(cases: Record<string, SnippetCase[]>): Record<string, Snippet> {
  const entry = (section: string, description: string): [string, Snippet] => [
    `Markset ${section}`,
    {
      prefix: section,
      body: escapeSnippetBody(selectSnippet(cases[section] ?? [], section)).split("\n"),
      description,
    },
  ];
  return Object.fromEntries([
    ...CONSTRUCTS.map((name) => entry(name, BLURB[name])),
    entry("diagram", "An ASCII fence inside a captioned figure, drawn as a picture."),
    entry("chart", "A figure's table drawn as a line, bar or column chart."),
  ]);
}

/**
 * What to offer after `:::` at the start of a line: every construct that takes a
 * fence, which is every construct but the callout, since a callout is a
 * blockquote. `columns` is offered with its `::col` separator as part of the
 * body, because the case is.
 */
export function fenceCompletions(snippets: Record<string, Snippet>): Array<{ name: string; snippet: Snippet }> {
  return CONSTRUCTS.filter((name) => name !== "callout").flatMap((name) => {
    const snippet = snippets[`Markset ${name}`];
    return snippet ? [{ name, snippet }] : [];
  });
}

export const CALLOUT_TYPES = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
