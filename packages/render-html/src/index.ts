import type { Root } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";
import { parseDocument, type Diagnostic, type Frontmatter } from "@markset/parser";
import { marksetHandlers } from "./handlers.ts";

export { marksetHandlers };

/** Render a parsed tree as an HTML fragment. Non-empty output ends with a newline, as in the CommonMark suite. */
export function renderHtml(tree: Root): string {
  const hast = toHast(tree, { handlers: marksetHandlers() });
  const html = toHtml(hast);
  return html === "" ? "" : `${html}\n`;
}

export interface PageOptions {
  /** Contents of a <title>; defaults to the first level-one heading's text, else "Document". */
  title?: string;
  /** Inline stylesheet text, or a URL to link. */
  stylesheet?: { inline: string } | { href: string };
  lang?: string;
}

/** Render a complete HTML page. Theme tokens (§6) become data attributes and custom properties on <body>. */
export function renderPage(tree: Root, options: PageOptions = {}): string {
  const meta = tree.frontmatter ?? null;
  const title = escapeHtml(options.title ?? firstHeading(tree) ?? "Document");
  const style = options.stylesheet && "inline" in options.stylesheet
    ? `<style>\n${options.stylesheet.inline}\n</style>\n`
    : options.stylesheet && "href" in options.stylesheet
      ? `<link rel="stylesheet" href="${escapeHtml(options.stylesheet.href)}">\n`
      : "";
  return `<!doctype html>\n<html lang="${escapeHtml(options.lang ?? "en")}">\n<head>\n<meta charset="utf-8">\n`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n${style}</head>\n`
    + `<body${bodyAttributes(meta)}>\n<main class="ms-document">\n${renderHtml(tree)}</main>\n</body>\n</html>\n`;
}

export function bodyAttributes(meta: Frontmatter | null): string {
  const theme = meta?.theme;
  const attrs: string[] = [];
  const vars: string[] = [];
  if (theme?.preset) attrs.push(`data-preset="${theme.preset}"`);
  if (theme?.density) attrs.push(`data-density="${theme.density}"`);
  if (theme?.radius) attrs.push(`data-radius="${theme.radius}"`);
  if (theme?.accent) vars.push(`--ms-accent: ${theme.accent}`);
  if (theme?.type.body) vars.push(`--ms-font-body: ${cssString(theme.type.body)}`);
  if (theme?.type.heading) vars.push(`--ms-font-heading: ${cssString(theme.type.heading)}`);
  if (theme?.type.scale) vars.push(`--ms-type-scale: ${theme.type.scale}`);
  if (vars.length) attrs.push(`style="${escapeHtml(vars.join("; "))}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

/** Parse and render in one step. Diagnostics are returned, not thrown; invalid documents still render. */
export function html(source: string): { html: string; diagnostics: Diagnostic[] } {
  const { ast, diagnostics } = parseDocument(source);
  return { html: renderHtml(ast), diagnostics };
}

function firstHeading(tree: Root): string | null {
  const heading = tree.children.find((n) => n.type === "heading" && n.depth === 1);
  if (!heading || heading.type !== "heading") return null;
  let text = "";
  const visit = (node: { type?: string; value?: unknown; children?: unknown[] }): void => {
    if (typeof node.value === "string" && node.type !== "html") text += node.value;
    for (const child of node.children ?? []) visit(child as { value?: unknown });
  };
  visit(heading);
  return text.trim() || null;
}

function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
