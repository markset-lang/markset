/**
 * Markset source <-> ProseMirror JSON, with no editor and no DOM.
 *
 * Reading goes through parseDocument, so there is one parser. Writing goes
 * through serializeDocument with the source the document was loaded from, so an
 * untouched document comes back byte for byte and an edit touches only its own
 * lines (D14).
 *
 * One thing the ProseMirror model cannot hold is the nesting of inline marks:
 * `***a***` is emphasis inside strong or strong inside emphasis, and a text
 * node only knows it is both. So a block the editor did not change is not
 * rebuilt from its marks at all: it is recognised by its JSON and given back
 * the mdast it was made from.
 */
import {
  parseDocument,
  readFrontmatter,
  serializeDocument,
  type Diagnostic,
  type Frontmatter,
} from "@markset-lang/parser";
import type { Nodes, PhrasingContent, Root, RootContent } from "mdast";
import { MARK_ORDER, withDefaults, type BlockAttributes, type JSONMark, type JSONNode } from "./model.ts";

/** A diagnostic from the parser, with the block it belongs to as a path of child indexes into `doc`. */
export interface EditorDiagnostic extends Diagnostic {
  /** Child indexes from the document down to the deepest block containing the problem; empty for the document itself. */
  path: number[];
}

export interface LoadedDocument {
  doc: JSONNode;
  /** The parsed §6 frontmatter, or null when the document has none. The raw text is the `frontmatter` node's `value`. */
  frontmatter: Frontmatter | null;
  diagnostics: EditorDiagnostic[];
}

/** Parse Markset source into ProseMirror JSON for the editor. Invalid documents load too; the diagnostics say where. */
export function fromMarkset(source: string): LoadedDocument {
  const { ast, frontmatter, diagnostics } = parseDocument(source);
  const ranges: Array<{ path: number[]; start: number; end: number }> = [];
  const doc = new Reader(ranges).root(ast);
  const located = diagnostics.map((diagnostic) => {
    let best: number[] = [];
    for (const range of ranges) {
      if (range.start <= diagnostic.start && diagnostic.start < Math.max(range.end, range.start + 1)) {
        if (range.path.length >= best.length) best = range.path;
      }
    }
    return { ...diagnostic, path: best };
  });
  return { doc, frontmatter, diagnostics: located };
}

/**
 * Write the editor's document as Markset source. Pass the source it was loaded
 * from as `original` and every part the editor did not change is copied from it.
 * Throws the parser's SerializeError if the document holds something no Markset
 * source can express; the editor's guards exist so that it cannot.
 */
export function toMarkset(doc: JSONNode, original?: string): string {
  if (original === undefined) return serializeDocument(new Writer(null).root(doc));
  const parsed = parseDocument(original);
  const known = new Known();
  new Reader([], known).root(parsed.ast);
  const tree = new Writer(known).root(doc);
  return serializeDocument(tree, { original: { source: original, ast: parsed.ast } });
}

/** What the parser would report for the editor's document as it stands, located by block. */
export function diagnose(doc: JSONNode, original?: string): EditorDiagnostic[] {
  return fromMarkset(toMarkset(doc, original)).diagnostics;
}

// ---------------------------------------------------------------------------
// Blocks recognised by their JSON

/** JSON of blocks from the original, each with the mdast it came from, in document order. */
class Known {
  readonly #byKey = new Map<string, unknown[]>();

  add(json: JSONNode | JSONNode[], mdast: unknown): void {
    const key = keyOf(json);
    const list = this.#byKey.get(key);
    if (list) list.push(mdast);
    else this.#byKey.set(key, [mdast]);
  }

  /** The mdast of the first unclaimed original block with exactly this JSON, claimed. */
  take<T>(json: JSONNode | JSONNode[]): T | undefined {
    const list = this.#byKey.get(keyOf(json));
    const found = list?.shift();
    return found === undefined ? undefined : (structuredClone(found) as T);
  }
}

function keyOf(json: JSONNode | JSONNode[]): string {
  const normal = Array.isArray(json) ? mergeText(json.map(withDefaults)) : withDefaults(json);
  return JSON.stringify(normal, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

/** Adjacent text with the same marks is one text node to ProseMirror, so it is one here. */
function mergeText(nodes: JSONNode[]): JSONNode[] {
  const out: JSONNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (
      node.type === "text" &&
      last?.type === "text" &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      out[out.length - 1] = { ...last, text: (last.text ?? "") + (node.text ?? "") };
    } else {
      out.push(node);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// mdast -> ProseMirror JSON

type AnyNode = Nodes & Record<string, unknown>;

class Reader {
  readonly ranges: Array<{ path: number[]; start: number; end: number }>;
  readonly known: Known | undefined;

  constructor(ranges: Array<{ path: number[]; start: number; end: number }>, known?: Known) {
    this.ranges = ranges;
    this.known = known;
  }

  root(tree: Root): JSONNode {
    return { type: "doc", content: this.blocks(tree.children, []) };
  }

  blocks(nodes: RootContent[], path: number[]): JSONNode[] {
    return nodes.map((node, index) => this.block(node as AnyNode, [...path, index]));
  }

  block(node: AnyNode, path: number[]): JSONNode {
    if (node.position) {
      this.ranges.push({ path, start: node.position.start.offset!, end: node.position.end.offset! });
    }
    const json = this.convert(node, path);
    if (TEXTBLOCKS.has(json.type)) this.known?.add(json, node);
    return json;
  }

  convert(node: AnyNode, path: number[]): JSONNode {
    const attrs = (extra: Record<string, unknown> = {}) => ({ ...extra, attributes: blockAttributes(node) });
    const children = (list: unknown[], offset = 0) =>
      (list as RootContent[]).map((child, index) => this.block(child as AnyNode, [...path, index + offset]));
    const n = node as unknown as Record<string, never>;
    switch (node.type) {
      case "yaml":
        return { type: "frontmatter", attrs: { value: n.value } };
      case "paragraph":
        return withContent({ type: "paragraph", attrs: attrs() }, this.inline(n.children));
      case "heading":
        return withContent({ type: "heading", attrs: attrs({ level: n.depth }) }, this.inline(n.children));
      case "blockquote":
        return withContent({ type: "blockquote", attrs: attrs() }, children(n.children));
      case "list":
        return withContent(
          n.ordered
            ? { type: "orderedList", attrs: attrs({ start: n.start ?? 1, spread: n.spread }) }
            : { type: "bulletList", attrs: attrs({ spread: n.spread }) },
          children(n.children),
        );
      case "listItem":
        return withContent(
          { type: "listItem", attrs: attrs({ spread: n.spread, checked: n.checked ?? null }) },
          children(n.children),
        );
      case "code":
        return withContent(
          { type: "codeBlock", attrs: attrs({ language: n.lang ?? null, meta: n.meta ?? null }) },
          n.value === "" ? [] : [{ type: "text", text: n.value }],
        );
      case "thematicBreak":
        return { type: "horizontalRule", attrs: attrs() };
      case "html":
        return { type: "htmlBlock", attrs: attrs({ value: n.value }) };
      case "definition":
        return {
          type: "definition",
          attrs: { identifier: n.identifier, label: n.label ?? null, url: n.url, title: n.title ?? null },
        };
      case "table":
        return withContent({ type: "table", attrs: attrs({ align: n.align ?? [] }) }, children(n.children));
      case "tableRow":
        return withContent({ type: "tableRow" }, children(n.children));
      case "tableCell":
        return withContent({ type: "tableCell" }, this.inline(n.children));

      case "callout":
        return withContent({ type: "callout", attrs: attrs({ kind: n.kind, fold: n.fold }) }, [
          this.title("calloutTitle", n.title ?? []),
          ...children(n.children, 1),
        ]);
      case "card":
        return withContent({ type: "card", attrs: { tone: n.tone, compact: n.compact, ...identity(node) } }, [
          ...(n.title === null ? [] : [this.title("cardTitle", n.title)]),
          ...children(n.children, n.title === null ? 0 : 1),
        ]);
      case "grid":
        return withContent(
          { type: "grid", attrs: { cols: n.cols, gap: n.gap, ...identity(node) } },
          children(n.children),
        );
      case "columns":
        return withContent(
          { type: "columns", attrs: { ratio: n.ratio, gap: n.gap, ...identity(node) } },
          children(n.children),
        );
      case "column":
        return withContent({ type: "column", attrs: identity(node) }, children(n.children));
      case "tabs":
        return withContent({ type: "tabs", attrs: { active: n.active, ...identity(node) } }, children(n.children));
      case "tab":
        return withContent({ type: "tab", attrs: attrs({ depth: n.depth }) }, [
          this.title("tabLabel", n.label),
          ...children(n.children, 1),
        ]);
      case "steps":
        return withContent({ type: "steps", attrs: identity(node) }, children(n.children));
      case "metrics":
        return withContent(
          { type: "metrics", attrs: { direction: n.direction, ...identity(node) } },
          children(n.children),
        );
      case "figure": {
        const caption = n.caption as PhrasingContent[] | null;
        const offset = caption === null ? 0 : 1;
        const content = (n.children as AnyNode[]).map((child, index) =>
          isImageParagraph(child) ? this.figureImage(child) : this.block(child, [...path, index + offset]),
        );
        return withContent({ type: "figure", attrs: { width: n.width, chart: n.chart ?? null, ...identity(node) } }, [
          ...(caption === null ? [] : [this.title("figureCaption", caption)]),
          ...content,
        ]);
      }
      case "directive":
        return withContent({ type: "directive", attrs: { name: n.name, attributes: plain(n.attributes) } }, [
          ...(n.argument === null ? [] : [this.title("directiveArgument", n.argument)]),
          ...children(n.children, n.argument === null ? 0 : 1),
        ]);
      case "separator":
        return { type: "separator", attrs: { name: n.name, attributes: plain(n.attributes) } };
      default:
        throw new Error(`no editor node for mdast "${node.type}"`);
    }
  }

  title(type: string, inline: PhrasingContent[]): JSONNode {
    const json = withContent({ type }, this.inline(inline));
    this.known?.add(json.content ?? [], inline);
    return json;
  }

  figureImage(paragraph: AnyNode): JSONNode {
    const image = (paragraph.children as AnyNode[])[0] as unknown as Record<string, string | null>;
    return { type: "figureImage", attrs: { src: image.url, alt: image.alt ?? null, title: image.title ?? null } };
  }

  inline(nodes: PhrasingContent[], marks: JSONMark[] = []): JSONNode[] {
    const out: JSONNode[] = [];
    const text = (value: string, extra: JSONMark[] = []) => {
      if (value === "") return;
      const all = [...marks, ...extra];
      out.push(all.length > 0 ? { type: "text", text: value, marks: all } : { type: "text", text: value });
    };
    for (const node of nodes) {
      const n = node as unknown as Record<string, never>;
      switch (node.type) {
        case "text":
          text(n.value);
          break;
        case "inlineCode":
          text(n.value, [{ type: "code" }]);
          break;
        case "emphasis":
          out.push(...this.inline(n.children, [...marks, { type: "italic" }]));
          break;
        case "strong":
          out.push(...this.inline(n.children, [...marks, { type: "bold" }]));
          break;
        case "link":
          out.push(
            ...this.inline(n.children, [...marks, { type: "link", attrs: { href: n.url, title: n.title ?? null } }]),
          );
          break;
        case "linkReference":
          out.push(
            ...this.inline(n.children, [
              ...marks,
              {
                type: "linkReference",
                attrs: { identifier: n.identifier, label: n.label ?? null, referenceType: n.referenceType },
              },
            ]),
          );
          break;
        case "span": {
          const a = n.attributes as unknown as NonNullable<BlockAttributes>;
          if ((n.children as unknown[]).length === 0) {
            out.push(withMarks({ type: "emptySpan", attrs: plain(a) }, marks));
            break;
          }
          out.push(
            ...this.inline(n.children, [
              ...marks,
              { type: "span", attrs: { id: a.id, classes: [...a.classes], attrs: { ...a.attrs } } },
            ]),
          );
          break;
        }
        case "break":
          out.push(withMarks({ type: "hardBreak" }, marks));
          break;
        case "image":
          out.push(
            withMarks({ type: "image", attrs: { src: n.url, alt: n.alt ?? null, title: n.title ?? null } }, marks),
          );
          break;
        case "imageReference":
          out.push(
            withMarks(
              {
                type: "imageReference",
                attrs: {
                  identifier: n.identifier,
                  label: n.label ?? null,
                  referenceType: n.referenceType,
                  alt: n.alt ?? null,
                },
              },
              marks,
            ),
          );
          break;
        case "html":
          out.push(withMarks({ type: "htmlInline", attrs: { value: n.value } }, marks));
          break;
        default:
          throw new Error(`no editor node for inline mdast "${node.type}"`);
      }
    }
    return mergeText(out);
  }
}

/** Blocks whose inline content is recognised by JSON on the way back. */
const TEXTBLOCKS = new Set(["paragraph", "heading", "tableCell"]);

function withContent(json: JSONNode, content: JSONNode[]): JSONNode {
  return content.length > 0 ? { ...json, content } : json;
}

function withMarks(json: JSONNode, marks: JSONMark[]): JSONNode {
  return marks.length > 0 ? { ...json, marks } : json;
}

function blockAttributes(node: AnyNode): BlockAttributes {
  const a = node.attributes as BlockAttributes | undefined;
  return a ? plain(a) : null;
}

function plain(a: NonNullable<BlockAttributes>): NonNullable<BlockAttributes> {
  return { id: a.id, classes: [...a.classes], attrs: { ...a.attrs } };
}

function identity(node: AnyNode): { id: string | null; classes: string[] } {
  return { id: (node.id as string | null) ?? null, classes: [...((node.classes as string[]) ?? [])] };
}

function isImageParagraph(node: AnyNode): boolean {
  const children = node.children as AnyNode[] | undefined;
  return node.type === "paragraph" && children?.length === 1 && children[0].type === "image";
}

// ---------------------------------------------------------------------------
// ProseMirror JSON -> mdast

type Block = Record<string, unknown> & { type: string };

class Writer {
  readonly known: Known | null;

  constructor(known: Known | null) {
    this.known = known;
  }

  root(doc: JSONNode): Root {
    const children = (doc.content ?? []).map((node) => this.block(node)) as RootContent[];
    const root: Root = { type: "root", children };
    const first = children[0];
    if (first?.type === "yaml") {
      const meta = readFrontmatter(first, []);
      if (meta) root.frontmatter = meta;
    }
    return root;
  }

  blocks(nodes: JSONNode[] | undefined): Block[] {
    return (nodes ?? []).map((node) => this.block(node));
  }

  block(input: JSONNode): Block {
    const json = withDefaults(input);
    if (TEXTBLOCKS.has(json.type)) {
      const reused = this.known?.take<Block>(json);
      if (reused) return reused;
    }
    const a = (json.attrs ?? {}) as Record<string, never>;
    const content = json.content ?? [];
    const withAttributes = (node: Block): Block => {
      const attributes = a.attributes as BlockAttributes;
      if (attributes) node.attributes = { type: "attributes", ...plain(attributes) };
      return node;
    };
    const titled = (name: string) => (content[0]?.type === name ? content[0] : undefined);
    const rest = (name: string) => (content[0]?.type === name ? content.slice(1) : content);
    switch (json.type) {
      case "frontmatter":
        return { type: "yaml", value: a.value };
      case "paragraph":
        return withAttributes({ type: "paragraph", children: this.inline(content) });
      case "heading":
        return withAttributes({ type: "heading", depth: a.level, children: this.inline(content) });
      case "blockquote":
        return withAttributes({ type: "blockquote", children: this.blocks(content) });
      case "bulletList":
        return withAttributes({
          type: "list",
          ordered: false,
          start: null,
          spread: a.spread,
          children: this.blocks(content),
        });
      case "orderedList":
        return withAttributes({
          type: "list",
          ordered: true,
          start: a.start,
          spread: a.spread,
          children: this.blocks(content),
        });
      case "listItem":
        return withAttributes({
          type: "listItem",
          spread: a.spread,
          checked: a.checked,
          children: this.blocks(content),
        });
      case "codeBlock":
        return withAttributes({ type: "code", lang: a.language, meta: a.meta, value: plainText(content) });
      case "horizontalRule":
        return withAttributes({ type: "thematicBreak" });
      case "htmlBlock":
        return withAttributes({ type: "html", value: a.value });
      case "definition":
        return { type: "definition", identifier: a.identifier, label: a.label, url: a.url, title: a.title };
      case "table":
        return withAttributes({ type: "table", align: [...(a.align as never[])], children: this.blocks(content) });
      case "tableRow":
        return { type: "tableRow", children: this.blocks(content) };
      case "tableCell":
        return { type: "tableCell", children: this.inline(content) };

      case "callout":
        return withAttributes({
          type: "callout",
          kind: a.kind,
          title: nullIfEmpty(this.title(titled("calloutTitle"))),
          fold: a.fold,
          children: this.blocks(rest("calloutTitle")),
        });
      case "card": {
        const title = titled("cardTitle");
        return {
          type: "card",
          title: title ? this.title(title) : null,
          tone: a.tone,
          compact: a.compact,
          id: a.id,
          classes: [...(a.classes as never[])],
          children: this.blocks(rest("cardTitle")),
        };
      }
      case "grid":
        return { type: "grid", cols: a.cols, gap: a.gap, ...identityOf(a), children: this.blocks(content) };
      case "columns":
        return { type: "columns", ratio: a.ratio, gap: a.gap, ...identityOf(a), children: this.blocks(content) };
      case "column":
        return { type: "column", ...identityOf(a), children: this.blocks(content) };
      case "tabs":
        return { type: "tabs", active: a.active, ...identityOf(a), children: this.blocks(content) };
      case "tab":
        return withAttributes({
          type: "tab",
          depth: a.depth,
          label: this.title(titled("tabLabel")),
          children: this.blocks(rest("tabLabel")),
        });
      case "steps":
        return { type: "steps", ...identityOf(a), children: this.blocks(content) };
      case "metrics":
        return { type: "metrics", direction: a.direction, ...identityOf(a), children: this.blocks(content) };
      case "figure": {
        const caption = titled("figureCaption");
        const figure: Block = {
          type: "figure",
          caption: caption ? this.title(caption) : null,
          width: a.width,
          ...identityOf(a),
          children: rest("figureCaption").map((node) =>
            node.type === "figureImage" ? imageParagraph(node) : this.block(node),
          ),
        };
        if (a.chart !== null) figure.chart = a.chart;
        return figure;
      }
      case "directive": {
        const argument = titled("directiveArgument");
        return {
          type: "directive",
          name: a.name,
          argument: argument ? this.title(argument) : null,
          attributes: { type: "attributes", ...plain(a.attributes as never) },
          children: this.blocks(rest("directiveArgument")),
        };
      }
      case "separator":
        return { type: "separator", name: a.name, attributes: { type: "attributes", ...plain(a.attributes as never) } };
      default:
        throw new Error(`no mdast for editor node "${json.type}"`);
    }
  }

  title(node: JSONNode | undefined): PhrasingContent[] {
    const content = node?.content ?? [];
    return this.known?.take<PhrasingContent[]>(content) ?? this.inline(content);
  }

  /** Rebuild nesting from marks: each run keeps the longest run of open marks it shares with the one before. */
  inline(content: JSONNode[]): PhrasingContent[] {
    const root: { children: PhrasingContent[] } = { children: [] };
    const stack: Array<{ mark: JSONMark | null; node: { children: PhrasingContent[] } }> = [{ mark: null, node: root }];
    for (const item of mergeText(content.map(withDefaults))) {
      const marks = (item.marks ?? []).filter((mark) => mark.type !== "code").sort(byRank);
      const code = (item.marks ?? []).some((mark) => mark.type === "code");
      let keep = 0;
      while (keep < stack.length - 1 && keep < marks.length && sameMark(stack[keep + 1].mark!, marks[keep])) keep++;
      stack.length = keep + 1;
      for (const mark of marks.slice(keep)) {
        const node = markNode(mark);
        stack[stack.length - 1].node.children.push(node);
        stack.push({ mark, node: node as unknown as { children: PhrasingContent[] } });
      }
      const into = stack[stack.length - 1].node.children;
      const leaf = inlineLeaf(item, code);
      const last = into[into.length - 1];
      if (leaf.type === "text" && last?.type === "text") last.value += leaf.value;
      else if (leaf.type === "inlineCode" && last?.type === "inlineCode") last.value += leaf.value;
      else into.push(leaf);
    }
    return root.children;
  }
}

function byRank(a: JSONMark, b: JSONMark): number {
  return MARK_ORDER.indexOf(a.type as never) - MARK_ORDER.indexOf(b.type as never);
}

function sameMark(a: JSONMark, b: JSONMark): boolean {
  return keyOf({ type: "text", text: "x", marks: [a] }) === keyOf({ type: "text", text: "x", marks: [b] });
}

function markNode(mark: JSONMark): PhrasingContent {
  const a = (mark.attrs ?? {}) as Record<string, never>;
  switch (mark.type) {
    case "bold":
      return { type: "strong", children: [] };
    case "italic":
      return { type: "emphasis", children: [] };
    case "link":
      return { type: "link", url: a.href, title: a.title, children: [] };
    case "linkReference":
      return {
        type: "linkReference",
        identifier: a.identifier,
        label: a.label,
        referenceType: a.referenceType,
        children: [],
      };
    case "span":
      return {
        type: "span",
        attributes: {
          type: "attributes",
          id: a.id,
          classes: [...(a.classes as never[])],
          attrs: { ...(a.attrs as object) },
        },
        children: [],
      } as never;
    default:
      throw new Error(`no mdast for mark "${mark.type}"`);
  }
}

function inlineLeaf(item: JSONNode, code: boolean): PhrasingContent {
  const a = (item.attrs ?? {}) as Record<string, never>;
  switch (item.type) {
    case "text":
      return code ? { type: "inlineCode", value: item.text ?? "" } : { type: "text", value: item.text ?? "" };
    case "hardBreak":
      return { type: "break" };
    case "image":
      return { type: "image", url: a.src, alt: a.alt, title: a.title };
    case "imageReference":
      return {
        type: "imageReference",
        identifier: a.identifier,
        label: a.label,
        referenceType: a.referenceType,
        alt: a.alt,
      };
    case "htmlInline":
      return { type: "html", value: a.value };
    case "emptySpan":
      return {
        type: "span",
        attributes: {
          type: "attributes",
          id: a.id,
          classes: [...(a.classes as never[])],
          attrs: { ...(a.attrs as object) },
        },
        children: [],
      } as never;
    default:
      throw new Error(`no mdast for inline editor node "${item.type}"`);
  }
}

function imageParagraph(node: JSONNode): Block {
  const a = withDefaults(node).attrs as Record<string, never>;
  return { type: "paragraph", children: [{ type: "image", url: a.src, alt: a.alt, title: a.title }] };
}

function identityOf(a: Record<string, unknown>): { id: string | null; classes: string[] } {
  return { id: (a.id as string | null) ?? null, classes: [...((a.classes as string[]) ?? [])] };
}

function nullIfEmpty<T>(list: T[]): T[] | null {
  return list.length === 0 ? null : list;
}

function plainText(content: JSONNode[]): string {
  return content.map((node) => node.text ?? "").join("");
}
