import type { Nodes, Root } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";
import { parseDocument, type Attributes, type Diagnostic, type Frontmatter } from "@markset/parser";
import { marksetHandlers } from "./handlers.ts";

export { marksetHandlers };

/** Render a parsed tree as an HTML fragment. Non-empty output ends with a newline, as in the CommonMark suite. */
export function renderHtml(tree: Root): string {
  const hast = toHast(withBlockAttributes(tree), { handlers: marksetHandlers() });
  const html = toHtml(hast);
  return html === "" ? "" : `${html}\n`;
}

export interface PageOptions {
  /** Contents of a <title>; defaults to the first level-one heading's text, else "Document". */
  title?: string;
  /** Inline stylesheet text, or a URL to link. */
  stylesheet?: { inline: string } | { href: string };
  /** A theme stylesheet (spec §6), emitted after `stylesheet` so it can style author classes and override tokens. */
  theme?: { inline: string } | { href: string };
  lang?: string;
}

/** Render a complete HTML page. Theme tokens (§6) become data attributes and custom properties on <body>. */
export function renderPage(tree: Root, options: PageOptions = {}): string {
  const meta = tree.frontmatter ?? null;
  const title = escapeHtml(options.title ?? firstHeading(tree) ?? "Document");
  const style = styleTag(options.stylesheet) + styleTag(options.theme);
  return `<!doctype html>\n<html lang="${escapeHtml(options.lang ?? "en")}">\n<head>\n<meta charset="utf-8">\n`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n${style}</head>\n`
    + `<body${bodyAttributes(meta)}>\n<main class="ms-document">\n${renderHtml(tree)}</main>\n</body>\n</html>\n`;
}

function styleTag(sheet: { inline: string } | { href: string } | undefined): string {
  if (!sheet) return "";
  return "inline" in sheet ? `<style>\n${sheet.inline}\n</style>\n` : `<link rel="stylesheet" href="${escapeHtml(sheet.href)}">\n`;
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

/**
 * Attribute lines (§2.5) leave an `attributes` field on ordinary mdast blocks.
 * mdast-util-to-hast applies `data.hProperties` to the element it creates, so
 * copy them there on a clone; the caller's tree is not modified.
 */
function withBlockAttributes(tree: Root): Root {
  const clone = structuredClone(tree);
  const visit = (node: Nodes): void => {
    const attributes = (node as { attributes?: Attributes }).attributes;
    if (attributes && !MARKSET_HANDLED.has(node.type)) {
      const properties: Record<string, string | string[]> = {};
      if (attributes.id) properties.id = attributes.id;
      if (attributes.classes.length) properties.className = attributes.classes;
      for (const [key, value] of Object.entries(attributes.attrs)) properties[`data-${key}`] = value;
      node.data = { ...node.data, hProperties: { ...(node.data as { hProperties?: object } | undefined)?.hProperties, ...properties } };
    }
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(clone);
  return clone;
}

/** Node types whose handlers in handlers.ts already read `attributes` or `id`/`classes` themselves. */
const MARKSET_HANDLED = new Set(["callout", "card", "grid", "columns", "column", "tabs", "tab", "steps", "metrics", "figure", "span", "directive", "separator"]);

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

/** Absolute path of the default stylesheet shipped with this package. */
export const defaultStylesheetPath: string = new URL("../css/markset.css", import.meta.url).pathname;
