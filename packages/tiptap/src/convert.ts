/**
 * Markset source <-> ProseMirror JSON, with no editor and no DOM. This module
 * is also the `@markset-lang/tiptap/convert` entry point, which a host whose
 * schema is not the kit's uses to read and write its own JSON: TipTap is never
 * imported here.
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
 *
 * A host's schema can differ from the kit's in names and shapes (TableKit's
 * `tableHeader` and paragraph cells, a block image), and can hold nodes and
 * marks Markset has no word for (task lists, strikethrough, mentions). The
 * `ConvertHost` argument says how: names for the nodes and marks the two share,
 * and hooks, both ways, for the ones only the host has.
 */
import {
  parseDocument,
  readFrontmatter,
  serializeDocument,
  type Diagnostic,
  type Frontmatter,
} from "@markset-lang/parser";
import type { Nodes, PhrasingContent, Root, RootContent } from "mdast";
import {
  MARK_ATTRIBUTES,
  NODE_ATTRIBUTES,
  TEMPLATES,
  markRank,
  withDefaults,
  type BlockAttributes,
  type ConstructName,
  type JSONMark,
  type JSONNode,
  type MarkName,
  type NodeName,
} from "./model.ts";

export { CONSTRUCTS, NODE_ATTRIBUTES, MARK_ATTRIBUTES, ALLOWED, TEMPLATES } from "./model.ts";
export type { BlockAttributes, ConstructName, JSONMark, JSONNode, MarkName, NodeName } from "./model.ts";

// ---------------------------------------------------------------------------
// Hosts

/** The names a host can rename: Markset's nodes and marks, and `tableHeader` for the cells of a table's first row. */
export type HostName = NodeName | MarkName | "tableHeader";

/** An mdast node that holds phrasing content, as a mark is written: `delete`, `emphasis`, `link`. */
export type MarkParent = Extract<PhrasingContent, { children: PhrasingContent[] }>;

/** What a host hook reading mdast can call back into. */
export interface ReadContext {
  /** Block mdast to the host's JSON, through the host's hooks again. */
  blocks(nodes: Nodes[]): JSONNode[];
  /** Phrasing mdast to the host's JSON, carrying the marks open where the hook was called. */
  inline(nodes: PhrasingContent[]): JSONNode[];
  /** The host's name for a Markset node or mark. */
  name(name: HostName): string;
}

/** What a host hook writing mdast can call back into. */
export interface WriteContext {
  /** The host's block JSON to mdast, through the host's hooks again. */
  blocks(nodes: JSONNode[]): RootContent[];
  /** The host's inline JSON to phrasing mdast. */
  inline(nodes: JSONNode[]): PhrasingContent[];
}

/**
 * How a host's schema differs from the kit's. Every field is optional; with
 * none, the JSON is exactly what `fromMarkset` gives and `toMarkset` takes.
 *
 * Each hook is asked first, for every node or mark, and its answer stands:
 * `undefined` leaves the node to Markset, `null` drops it (with a mark, keeps
 * the text and drops only the mark), anything else replaces it.
 */
export interface ConvertHost {
  /**
   * The host's names for nodes and marks it shares with Markset, where they
   * differ: `{ tableHeader: "tableHeader" }` for TableKit, whose header row is
   * made of `tableHeader` cells, or `{ image: "inlineImage" }` when the host's
   * own `image` is something else. A Markset name renamed away is free for the
   * host's own node of that name.
   */
  names?: Partial<Record<HostName, string>>;
  /**
   * What a table cell holds: inline content, as in the kit (`"inline"`, the
   * default), or a paragraph, as in TableKit's `block+` cells (`"paragraph"`).
   * Writing accepts either. A cell given more than one paragraph is written as
   * one line, its paragraphs joined by a space, because a GFM cell is one line.
   */
  cellContent?: "inline" | "paragraph";
  /** Nodes only the host has, or that it draws differently: a task list, a block image, a mention. */
  node?: {
    toJSON?: (node: Nodes, context: ReadContext) => JSONNode | JSONNode[] | null | undefined;
    toMdast?: (node: JSONNode, context: WriteContext) => Nodes | Nodes[] | null | undefined;
  };
  /** Marks only the host has: strikethrough, underline, a comment highlight. */
  mark?: {
    /** Asked for each phrasing mdast node: a mark here puts the node's children under it. */
    toJSON?: (node: Nodes, context: ReadContext) => JSONMark | null | undefined;
    /** The mdast node a mark is written as, with empty `children` for the text under it. */
    toMdast?: (mark: JSONMark, context: WriteContext) => MarkParent | null | undefined;
  };
}

/** A host's names both ways. */
class Names {
  readonly #toHost = new Map<string, string>();
  readonly #fromHost = new Map<string, string>();

  constructor(names: ConvertHost["names"] = {}) {
    for (const [markset, host] of Object.entries(names)) {
      if (host === undefined) continue;
      this.#toHost.set(markset, host);
      this.#fromHost.set(host, markset);
    }
  }

  host(name: string): string {
    return this.#toHost.get(name) ?? name;
  }

  /** Markset's name for a host type, or undefined for a node or mark only the host has. A header cell is a cell. */
  markset(type: string): string | undefined {
    let name = this.#fromHost.get(type);
    if (name === undefined) {
      // A Markset name the host renamed away now names one of the host's own.
      if (this.#toHost.has(type) && this.#toHost.get(type) !== type) return undefined;
      name = type;
    }
    if (name === "tableHeader") return "tableCell";
    return name in NODE_ATTRIBUTES || name in MARK_ATTRIBUTES ? name : undefined;
  }
}

const NO_NAMES = new Names();

/**
 * Read mdast, as parseDocument or remark-markset makes it, into a host's
 * ProseMirror JSON. Without a host the result is `fromMarkset`'s `doc`.
 */
export function mdastToJSON(root: Root, host: ConvertHost = {}): JSONNode {
  return new Reader([], undefined, host).root(root);
}

export interface JsonToMdastOptions {
  /**
   * The tree the document was read from. A block the editor did not change is
   * given back its original mdast, which keeps what marks cannot say, such as
   * how `***a***` nested. Pass the same tree to serializeDocument's `original`.
   */
  original?: Root;
}

/**
 * Write a host's ProseMirror JSON as Markset mdast, ready for
 * serializeDocument (`@markset-lang/parser`) or any mdast-util-to-markdown
 * pipeline with `marksetToMarkdownExtension()`.
 */
export function jsonToMdast(doc: JSONNode, host: ConvertHost = {}, options: JsonToMdastOptions = {}): Root {
  let known: Known | null = null;
  if (options.original) {
    known = new Known(new Names(host.names));
    new Reader([], known, host).root(options.original);
  }
  return new Writer(known, host).root(doc);
}

/**
 * A construct's starting mdast: the node `insertConstruct` inserts, before it
 * is JSON. A host reads it with its own `mdastToJSON` to insert a construct
 * shaped for its schema.
 */
export function constructTemplate(name: ConstructName): RootContent {
  const [node] = parseDocument(TEMPLATES[name]).ast.children;
  return JSON.parse(JSON.stringify(node, (key, value) => (key === "position" ? undefined : value))) as RootContent;
}

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
  if (original === undefined) return serializeDocument(jsonToMdast(doc));
  const parsed = parseDocument(original);
  const tree = jsonToMdast(doc, {}, { original: parsed.ast });
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
  readonly names: Names;

  constructor(names: Names = NO_NAMES) {
    this.names = names;
  }

  add(json: JSONNode | JSONNode[], mdast: unknown): void {
    const key = keyOf(json, this.names);
    const list = this.#byKey.get(key);
    if (list) list.push(mdast);
    else this.#byKey.set(key, [mdast]);
  }

  /** The mdast of the first unclaimed original block with exactly this JSON, claimed. */
  take<T>(json: JSONNode | JSONNode[]): T | undefined {
    const list = this.#byKey.get(keyOf(json, this.names));
    const found = list?.shift();
    return found === undefined ? undefined : (structuredClone(found) as T);
  }
}

/**
 * A key equal for two JSON nodes exactly when they say the same Markset: in
 * Markset's names, with every default filled, and without the attributes a
 * host's node carries that Markset has no field for (a TableKit cell's colspan).
 */
function keyOf(json: JSONNode | JSONNode[], names: Names = NO_NAMES): string {
  const normal = Array.isArray(json)
    ? mergeText(json.map((node) => withDefaults(canonical(node, names, true))))
    : withDefaults(canonical(json, names, true));
  return JSON.stringify(normal, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

/**
 * A node, and its marks, in Markset's names, with the attributes Markset knows
 * of filled from their defaults and any other dropped. A node or mark only the
 * host has is kept as it is. `deep` does the same to the content.
 */
function canonical(json: JSONNode, names: Names, deep = false): JSONNode {
  const type = names.markset(json.type);
  const out: JSONNode = { ...json, type: type ?? json.type };
  if (type !== undefined) out.attrs = known(json.attrs, NODE_ATTRIBUTES[type as NodeName]);
  if (json.marks) out.marks = json.marks.map((mark) => canonicalMark(mark, names));
  if (deep && json.content) out.content = json.content.map((child) => canonical(child, names, true));
  return out;
}

function canonicalMark(mark: JSONMark, names: Names): JSONMark {
  const type = names.markset(mark.type);
  if (type === undefined) return mark;
  return { ...mark, type, attrs: known(mark.attrs, MARK_ATTRIBUTES[type as MarkName]) };
}

function known(attrs: Record<string, unknown> | undefined, defaults: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(defaults ?? {})) {
    out[name] = attrs && name in attrs ? attrs[name] : structuredClone(value);
  }
  return out;
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
  readonly host: ConvertHost;
  readonly names: Names;

  constructor(ranges: Array<{ path: number[]; start: number; end: number }>, known?: Known, host: ConvertHost = {}) {
    this.ranges = ranges;
    this.known = known;
    this.host = host;
    this.names = known?.names ?? new Names(host.names);
  }

  root(tree: Root): JSONNode {
    return { type: "doc", content: this.blocks(tree.children, []) };
  }

  blocks(nodes: RootContent[], path: number[]): JSONNode[] {
    return nodes.flatMap((node, index) => this.hosted(node as AnyNode, [...path, index]));
  }

  /** A block through the host's hook first, then Markset's own reading. */
  hosted(node: AnyNode, path: number[], fallback = () => this.block(node, path)): JSONNode[] {
    const answer = this.host.node?.toJSON?.(node, this.context([]));
    if (answer === undefined) return [fallback()];
    return answer === null ? [] : Array.isArray(answer) ? answer : [answer];
  }

  context(marks: JSONMark[]): ReadContext {
    return {
      blocks: (nodes) => this.blocks(nodes as RootContent[], []),
      inline: (nodes) => this.inline(nodes, marks),
      name: (name) => this.names.host(name),
    };
  }

  /** A JSON node in the host's names. */
  named(json: JSONNode): JSONNode {
    const type = this.names.host(json.type);
    return type === json.type ? json : { ...json, type };
  }

  block(node: AnyNode, path: number[]): JSONNode {
    if (node.position) {
      this.ranges.push({ path, start: node.position.start.offset!, end: node.position.end.offset! });
    }
    const json = this.convert(node, path);
    if (TEXTBLOCKS.has(json.type)) this.known?.add(json, node);
    return this.named(json);
  }

  convert(node: AnyNode, path: number[]): JSONNode {
    const attrs = (extra: Record<string, unknown> = {}) => ({ ...extra, attributes: blockAttributes(node) });
    const children = (list: unknown[], offset = 0) =>
      (list as RootContent[]).flatMap((child, index) => this.hosted(child as AnyNode, [...path, index + offset]));
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
      case "table": {
        const rows = children(n.children);
        // TableKit sets the first row's cells apart as header cells.
        const header = this.host.names?.tableHeader;
        if (header && rows[0]?.content)
          rows[0] = { ...rows[0], content: rows[0].content.map((cell) => ({ ...cell, type: header })) };
        return withContent({ type: "table", attrs: attrs({ align: n.align ?? [] }) }, rows);
      }
      case "tableRow":
        return withContent({ type: "tableRow" }, children(n.children));
      case "tableCell": {
        const inline = this.inline(n.children);
        if (this.host.cellContent !== "paragraph") return withContent({ type: "tableCell" }, inline);
        // The cell's text is recognised on the way back as a title's is, whatever the paragraph around it became.
        this.known?.add(inline, n.children);
        return {
          type: "tableCell",
          content: [withContent(this.named({ type: "paragraph", attrs: { attributes: null } }), inline)],
        };
      }

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
        const content = (n.children as AnyNode[]).flatMap((child, index) =>
          this.hosted(child, [...path, index + offset], () =>
            isImageParagraph(child) ? this.figureImage(child) : this.block(child, [...path, index + offset]),
          ),
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
    const json = withContent(this.named({ type }), this.inline(inline));
    this.known?.add(json.content ?? [], inline);
    return json;
  }

  figureImage(paragraph: AnyNode): JSONNode {
    const image = (paragraph.children as AnyNode[])[0] as unknown as Record<string, string | null>;
    return this.named({
      type: "figureImage",
      attrs: { src: image.url, alt: image.alt ?? null, title: image.title ?? null },
    });
  }

  inline(nodes: PhrasingContent[], marks: JSONMark[] = []): JSONNode[] {
    const out: JSONNode[] = [];
    const text = (value: string, extra: JSONMark[] = []) => {
      if (value === "") return;
      const all = [...marks, ...extra.map((mark) => this.named(mark))];
      out.push(all.length > 0 ? { type: "text", text: value, marks: all } : { type: "text", text: value });
    };
    const mark = (json: JSONMark): JSONMark[] => [...marks, this.named(json)];
    const leaf = (json: JSONNode) => out.push(withMarks(this.named(json), marks));
    for (const node of nodes) {
      const n = node as unknown as Record<string, never>;
      const answer = this.host.node?.toJSON?.(node, this.context(marks));
      if (answer !== undefined) {
        for (const json of answer === null ? [] : Array.isArray(answer) ? answer : [answer]) {
          out.push(withMarks(json, [...marks, ...(json.marks ?? [])]));
        }
        continue;
      }
      const hostMark = this.host.mark?.toJSON?.(node, this.context(marks));
      if (hostMark !== undefined) {
        const children = ((node as { children?: PhrasingContent[] }).children ?? []) as PhrasingContent[];
        out.push(...this.inline(children, hostMark === null ? marks : [...marks, hostMark]));
        continue;
      }
      switch (node.type) {
        case "text":
          text(n.value);
          break;
        case "inlineCode":
          text(n.value, [{ type: "code" }]);
          break;
        case "emphasis":
          out.push(...this.inline(n.children, mark({ type: "italic" })));
          break;
        case "strong":
          out.push(...this.inline(n.children, mark({ type: "bold" })));
          break;
        case "link":
          out.push(...this.inline(n.children, mark({ type: "link", attrs: { href: n.url, title: n.title ?? null } })));
          break;
        case "linkReference":
          out.push(
            ...this.inline(
              n.children,
              mark({
                type: "linkReference",
                attrs: { identifier: n.identifier, label: n.label ?? null, referenceType: n.referenceType },
              }),
            ),
          );
          break;
        case "span": {
          const a = n.attributes as unknown as NonNullable<BlockAttributes>;
          if ((n.children as unknown[]).length === 0) {
            leaf({ type: "emptySpan", attrs: plain(a) });
            break;
          }
          out.push(
            ...this.inline(
              n.children,
              mark({ type: "span", attrs: { id: a.id, classes: [...a.classes], attrs: { ...a.attrs } } }),
            ),
          );
          break;
        }
        case "break":
          leaf({ type: "hardBreak" });
          break;
        case "image":
          leaf({ type: "image", attrs: { src: n.url, alt: n.alt ?? null, title: n.title ?? null } });
          break;
        case "imageReference":
          leaf({
            type: "imageReference",
            attrs: {
              identifier: n.identifier,
              label: n.label ?? null,
              referenceType: n.referenceType,
              alt: n.alt ?? null,
            },
          });
          break;
        case "html":
          leaf({ type: "htmlInline", attrs: { value: n.value } });
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
  readonly host: ConvertHost;
  readonly names: Names;
  readonly context: WriteContext;

  constructor(known: Known | null, host: ConvertHost = {}) {
    this.known = known;
    this.host = host;
    this.names = known?.names ?? new Names(host.names);
    this.context = {
      blocks: (nodes) => this.blocks(nodes) as RootContent[],
      inline: (nodes) => this.inline(nodes),
    };
  }

  root(doc: JSONNode): Root {
    const children = this.blocks(doc.content) as RootContent[];
    const root: Root = { type: "root", children };
    const first = children[0];
    if (first?.type === "yaml") {
      const meta = readFrontmatter(first, []);
      if (meta) root.frontmatter = meta;
    }
    return root;
  }

  blocks(nodes: JSONNode[] | undefined): Block[] {
    return (nodes ?? []).flatMap((node) => this.hosted(node));
  }

  /** A block through the host's hook first, then Markset's own writing. */
  hosted(node: JSONNode): Block[] {
    const answer = this.host.node?.toMdast?.(node, this.context);
    if (answer === undefined) return [this.block(node)];
    return (answer === null ? [] : Array.isArray(answer) ? answer : [answer]) as Block[];
  }

  block(input: JSONNode): Block {
    if (this.names.markset(input.type) === undefined) throw new Error(`no mdast for editor node "${input.type}"`);
    // Defaults for this node only: its content is the host's until each child is written in turn.
    const named = canonical(input, this.names);
    const json = { ...withDefaults({ ...named, content: undefined }), content: named.content };
    if (TEXTBLOCKS.has(json.type)) {
      const reused = this.known?.take<Block>(input);
      if (reused) return reused;
    }
    const a = (json.attrs ?? {}) as Record<string, never>;
    const content = json.content ?? [];
    const withAttributes = (node: Block): Block => {
      const attributes = a.attributes as BlockAttributes;
      if (attributes) node.attributes = { type: "attributes", ...plain(attributes) };
      return node;
    };
    const isFirst = (name: string) => content[0] !== undefined && this.names.markset(content[0].type) === name;
    const titled = (name: string) => (isFirst(name) ? content[0] : undefined);
    const rest = (name: string) => (isFirst(name) ? content.slice(1) : content);
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
      case "listItem": {
        const children = this.blocks(content);
        return withAttributes({
          type: "listItem",
          // A host's list item may not carry `spread`. Two paragraphs in one item
          // need a blank line between them, which makes the item loose when read.
          spread: input.attrs && "spread" in input.attrs ? a.spread : needsBlankLine(children),
          checked: a.checked,
          children,
        });
      }
      case "codeBlock":
        return withAttributes({ type: "code", lang: a.language, meta: a.meta, value: plainText(content) });
      case "horizontalRule":
        return withAttributes({ type: "thematicBreak" });
      case "htmlBlock":
        return withAttributes({ type: "html", value: a.value });
      case "definition":
        return { type: "definition", identifier: a.identifier, label: a.label, url: a.url, title: a.title };
      case "table": {
        // One alignment per column, as the parser gives: a host's table may carry none.
        const align = [...(a.align as Array<string | null>)];
        const columns = content[0]?.content?.length ?? 0;
        while (align.length < columns) align.push(null);
        return withAttributes({ type: "table", align, children: this.blocks(content) });
      }
      case "tableRow":
        return { type: "tableRow", children: this.blocks(content) };
      case "tableCell":
        return { type: "tableCell", children: this.cell(content) };

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
          children: rest("figureCaption").flatMap((node) =>
            this.host.node?.toMdast?.(node, this.context) === undefined &&
            this.names.markset(node.type) === "figureImage"
              ? [imageParagraph(canonical(node, this.names))]
              : this.hosted(node),
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

  /** A cell's content: inline, or a host's paragraphs (TableKit's `block+`), which one GFM line has to hold. */
  cell(content: JSONNode[]): PhrasingContent[] {
    if (!content.some((node) => this.names.markset(node.type) === "paragraph")) return this.inline(content);
    const lines = content.map((paragraph) => this.title(paragraph)).filter((line) => line.length > 0);
    const joined: PhrasingContent[] = [];
    for (const node of lines.flatMap((line, index) => (index === 0 ? line : [{ type: "text", value: " " }, ...line]))) {
      const last = joined.at(-1);
      if (node.type === "text" && last?.type === "text") last.value += node.value;
      else joined.push(node as PhrasingContent);
    }
    return joined;
  }

  /** Rebuild nesting from marks: each run keeps the longest run of open marks it shares with the one before. */
  inline(content: JSONNode[]): PhrasingContent[] {
    const root: { children: PhrasingContent[] } = { children: [] };
    const stack: Array<{ mark: JSONMark | null; node: { children: PhrasingContent[] } }> = [{ mark: null, node: root }];
    // A host's mark is written as the node its hook gives, or dropped when the hook says null.
    const written = new Map<string, PhrasingContent | null>();
    const writeMark = (mark: JSONMark): PhrasingContent | null => {
      const key = keyOf({ type: "text", text: "x", marks: [mark] }, this.names);
      if (!written.has(key)) {
        // The hook sees the mark in the host's own name.
        const own = this.names.markset(mark.type) === mark.type ? { ...mark, type: this.names.host(mark.type) } : mark;
        const answer = this.host.mark?.toMdast?.(own, this.context);
        written.set(key, answer === undefined ? markNode(mark) : answer);
      }
      const node = written.get(key);
      return node ? structuredClone(node) : null;
    };
    // Each leaf in Markset's names, remembering the host's node it was, which is what a hook is shown.
    const own = new Map<JSONNode, JSONNode>();
    const leaves = content.map((node) => {
      const leaf = withDefaults(canonical(node, this.names));
      own.set(leaf, node);
      return leaf;
    });
    for (const item of expelWhitespace(mergeText(leaves))) {
      const marks = (item.marks ?? []).filter((mark) => mark.type !== "code" && writeMark(mark) !== null).sort(byRank);
      const code = (item.marks ?? []).some((mark) => mark.type === "code");
      let keep = 0;
      while (keep < stack.length - 1 && keep < marks.length && sameMark(stack[keep + 1].mark!, marks[keep], this.names))
        keep++;
      stack.length = keep + 1;
      for (const mark of marks.slice(keep)) {
        const node = writeMark(mark)!;
        stack[stack.length - 1].node.children.push(node);
        stack.push({ mark, node: node as unknown as { children: PhrasingContent[] } });
      }
      const into = stack[stack.length - 1].node.children;
      const answer = this.host.node?.toMdast?.(own.get(item) ?? item, this.context);
      if (answer !== undefined) {
        into.push(...((answer === null ? [] : Array.isArray(answer) ? answer : [answer]) as PhrasingContent[]));
        continue;
      }
      if (this.names.markset((own.get(item) ?? item).type) === undefined) {
        throw new Error(`no mdast for inline editor node "${(own.get(item) ?? item).type}"`);
      }
      const leaf = inlineLeaf(item, code);
      const last = into[into.length - 1];
      if (leaf.type === "text" && last?.type === "text") last.value += leaf.value;
      else if (leaf.type === "inlineCode" && last?.type === "inlineCode") last.value += leaf.value;
      else into.push(leaf);
    }
    return root.children;
  }
}

/** Marks CommonMark's flanking rules apply to: `** Bold**` is not strong, so a space cannot sit just inside one. */
const ATTENTION = new Set(["bold", "italic"]);

/**
 * Move whitespace at the edge of a bold or italic run to outside it. An editor
 * lets a reader switch bold on and type " Bold", and the only Markset that
 * says what they meant is ` **Bold**`.
 */
function expelWhitespace(items: JSONNode[]): JSONNode[] {
  const has = (node: JSONNode | undefined, mark: JSONMark) =>
    (node?.marks ?? []).some((other) => sameMark(other, mark));
  const out: JSONNode[] = [];
  items.forEach((item, index) => {
    const marks = item.marks ?? [];
    if (item.type !== "text" || !marks.some((mark) => ATTENTION.has(mark.type))) {
      out.push(item);
      return;
    }
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(item.text ?? "")!;
    const keep = (neighbour: JSONNode | undefined) =>
      marks.filter((mark) => !ATTENTION.has(mark.type) || has(neighbour, mark));
    const piece = (text: string, kept: JSONMark[]) => {
      if (text !== "") out.push(kept.length > 0 ? { type: "text", text, marks: kept } : { type: "text", text });
    };
    if (core === "") {
      const kept = keep(items[index - 1]).filter((mark) => keep(items[index + 1]).includes(mark));
      piece(item.text ?? "", kept);
      return;
    }
    piece(lead, keep(items[index - 1]));
    piece(core, marks);
    piece(trail, keep(items[index + 1]));
  });
  return mergeText(out);
}

function byRank(a: JSONMark, b: JSONMark): number {
  return markRank(a.type) - markRank(b.type);
}

function sameMark(a: JSONMark, b: JSONMark, names: Names = NO_NAMES): boolean {
  return (
    keyOf({ type: "text", text: "x", marks: [a] }, names) === keyOf({ type: "text", text: "x", marks: [b] }, names)
  );
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

/** Whether two neighbouring blocks would merge without a blank line, as two paragraphs do. */
function needsBlankLine(children: Block[]): boolean {
  return children.some(
    (child, index) =>
      index > 0 &&
      children[index - 1].type === "paragraph" &&
      (child.type === "paragraph" || child.type === "definition"),
  );
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
