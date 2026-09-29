/**
 * Markset tree to Markset source.
 *
 * Without an original, the output is canonical: the §3 serialization choices,
 * written by the to-markdown extension in to-markdown.ts. With one, it is a
 * patch: every node the tree still has unchanged is copied from the original
 * source rather than re-serialized, so an edit touches only its own lines and a
 * tree that was not edited at all gives back the original bytes. mdast drops
 * the formatting choices an author made (`*` or `_`, list markers, fence
 * lengths, blank lines), and this is how they survive an editor.
 *
 * Nothing here trusts itself: the result is parsed again and compared with the
 * tree it was asked to write. A patch that does not reproduce the tree is
 * discarded for the canonical form, and a canonical form that does not is an
 * error, because the alternative is writing a file that says something the
 * author did not.
 */
import type { Nodes, Root } from "mdast";
import { defaultHandlers, toMarkdown, type Handle, type Options, type State } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { parseDocument } from "./document.ts";
import type { Attributes } from "./attributes.ts";
import {
  ATTRIBUTABLE,
  CANONICAL_OPTIONS,
  marksetToMarkdown,
  stringifyAttributes,
  withAttributeLine,
  type Handler,
  type SourceHints,
} from "./to-markdown.ts";

export interface SerializeOptions {
  /**
   * The source the tree was edited from, and its parse. Parts of the tree that
   * are unchanged are copied from this source, byte for byte.
   */
  original?: { source: string; ast: Root };
}

export class SerializeError extends Error {}

type Node = Nodes & { children?: Node[]; attributes?: unknown };

/** Serialize a Markset tree to Markset source. See the module comment for what `original` changes. */
export function serializeDocument(tree: Root, options: SerializeOptions = {}): string {
  const key = keyer();
  const want = key(tree);
  const { original } = options;
  if (original) {
    if (key(original.ast) === want) return original.source;
    // Node by node first; if that does not reproduce the tree, block by block,
    // which still leaves every untouched top-level block as the author wrote it.
    for (const depth of ["nodes", "blocks"] as const) {
      const patched = write(tree, patchHints(tree, original, key, depth));
      if (reparses(patched, want)) return patched;
    }
  }
  const canonical = write(tree, undefined);
  if (reparses(canonical, want)) return canonical;
  throw new SerializeError("the tree cannot be written as Markset source that parses back to the same tree");
}

/** The patched form without the check or the fallback. For tests that need to see a patch fail. */
export function patchDocument(tree: Root, original: { source: string; ast: Root }): string {
  const key = keyer();
  return write(tree, patchHints(tree, original, key, "nodes"));
}

function reparses(source: string, want: string): boolean {
  return keyer()(parseDocument(source).ast) === want;
}

// ---------------------------------------------------------------------------
// Structural identity

/**
 * A string that is equal for two nodes exactly when they are the same tree,
 * ignoring `position` and `data`, and ignoring key order so that a tree built
 * by hand compares equal to a parsed one.
 */
function keyer(): (value: unknown) => string {
  const memo = new WeakMap<object, string>();
  const key = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    const known = memo.get(value);
    if (known !== undefined) return known;
    let result: string;
    if (Array.isArray(value)) {
      result = `[${value.map(key).join(",")}]`;
    } else {
      const record = value as Record<string, unknown>;
      const names = Object.keys(record)
        .filter((name) => name !== "position" && name !== "data" && record[name] !== undefined)
        .sort();
      result = `{${names.map((name) => `${JSON.stringify(name)}:${key(record[name])}`).join(",")}}`;
    }
    memo.set(value, result);
    return result;
  };
  return key;
}

/** A node's own fields: everything but its block children. */
function headKey(node: Node, key: (value: unknown) => string): string {
  const { children: _children, ...own } = node as Node & { children?: unknown };
  return key(own);
}

/** Fields holding lists of nodes: block children, and the inline content of titles, labels and captions. */
const NODE_LISTS = ["children", "title", "label", "argument", "caption"] as const;

function nodeLists(node: Node): Array<[string, Node[]]> {
  const lists: Array<[string, Node[]]> = [];
  for (const name of NODE_LISTS) {
    const value = (node as unknown as Record<string, unknown>)[name];
    if (Array.isArray(value)) lists.push([name, value as Node[]]);
  }
  return lists;
}

// ---------------------------------------------------------------------------
// Writing

function write(tree: Root, hints: PatchHints | undefined): string {
  const extensions: Options[] = [gfmTableToMarkdown(), frontmatterToMarkdown(["yaml"]), marksetToMarkdown(hints)];
  const handlers: Record<string, Handler> = { ...(defaultHandlers as unknown as Record<string, Handle>) };
  for (const extension of extensions) Object.assign(handlers, extension.handlers);
  // A root is always flow here. mdast-util-to-markdown joins a root holding an
  // `html` node as phrasing, which would run raw HTML blocks together.
  let written = "";
  handlers.root = (node, _, state, info) => {
    if (hints) state.containerFlow = separatedBy(hints);
    written = state.containerFlow(node as Root, info);
    return written;
  };
  for (const type of ATTRIBUTABLE) handlers[type] = withAttributeLine(type, handlers[type], hints);
  if (hints) {
    for (const [type, base] of Object.entries(handlers)) handlers[type] = hints.wrap(type, base);
  }
  // The root's own text, rather than toMarkdown's result, which may have had a newline added.
  toMarkdown(tree, { ...CANONICAL_OPTIONS, extensions: [...extensions, { handlers }] });
  if (tree.children.length === 0) return hints?.emptyDocument() ?? "";
  return (hints?.leading(tree) ?? "") + written + (hints?.trailing(tree) ?? "\n");
}

/**
 * mdast-util-to-markdown's containerFlow, except that the separator between two
 * blocks can be the original text rather than only a count of blank lines.
 */
function separatedBy(hints: SourceHints): State["containerFlow"] {
  return function containerFlow(this: State, parent, info) {
    const children = (parent.children ?? []) as Nodes[];
    const tracker = this.createTracker(info);
    const results: string[] = [];
    this.indexStack.push(-1);
    children.forEach((child, index) => {
      this.indexStack[this.indexStack.length - 1] = index;
      results.push(tracker.move(this.handle(child, parent, this, { before: "\n", after: "\n", ...tracker.current() })));
      if (child.type !== "list") this.bulletLastUsed = undefined;
      const next = children[index + 1];
      if (next) results.push(tracker.move(hints.between(child, next) ?? joined(child, next, parent, this)));
    });
    this.indexStack.pop();
    return results.join("");
  };
}

/** The separator mdast-util-to-markdown's own join rules choose. */
function joined(left: Nodes, right: Nodes, parent: Parameters<State["containerFlow"]>[0], state: State): string {
  for (let index = state.join.length - 1; index >= 0; index--) {
    const result = state.join[index](left as never, right as never, parent, state);
    if (result === true || result === 1) break;
    if (typeof result === "number") return "\n".repeat(1 + result);
    if (result === false) return "\n\n<!---->\n\n";
  }
  return "\n\n";
}

// ---------------------------------------------------------------------------
// Patching

interface PatchHints extends SourceHints {
  wrap(type: string, base: Handler): Handler;
  leading(tree: Root): string | undefined;
  trailing(tree: Root): string | undefined;
  emptyDocument(): string;
}

interface Place {
  parent: Node;
  list: Node[];
  index: number;
  /** Containers above the node that put a prefix on each of its lines: blockquotes, callouts, list items. */
  prefixed: Node[];
}

const PREFIXING = new Set(["blockquote", "callout", "listItem"]);
const CONSTRUCT_FENCES = new Set(["card", "grid", "columns", "tabs", "steps", "metrics", "figure", "directive"]);
const ATTRIBUTE_LINE = /^ {0,3}\{.*\}[ \t]*$/;

function patchHints(
  tree: Root,
  original: { source: string; ast: Root },
  key: (value: unknown) => string,
  depth: "nodes" | "blocks",
): PatchHints {
  const { source } = original;
  const oldRoot = original.ast as Node;

  // --- where each original node sits -------------------------------------
  const place = new Map<Node, Place>();
  (function index(node: Node, prefixed: Node[]): void {
    const inner = PREFIXING.has(node.type) ? [...prefixed, node] : prefixed;
    for (const [, list] of nodeLists(node)) {
      list.forEach((child, i) => {
        place.set(child, { parent: node, list, index: i, prefixed: inner });
        index(child, inner);
      });
    }
  })(oldRoot, []);

  // --- lines ----------------------------------------------------------------
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };
  const lineEnd = (line: number): number => {
    const next = lineStarts[line + 1];
    return next === undefined ? source.length : next - 1;
  };

  /** Offset where a line's content starts once the prefixes of `containers` are taken off, or null when unsure. */
  function contentStart(line: number, containers: Node[]): number | null {
    let at = lineStarts[line];
    const end = lineEnd(line);
    for (const container of containers) {
      if (container.type === "listItem") {
        const width = itemIndent(container);
        if (width === null) return null;
        if (line === container.position!.start.line - 1) {
          at += width;
          continue;
        }
        let taken = 0;
        while (taken < width && at < end && source[at] === " ") {
          at++;
          taken++;
        }
        if (source[at] === "\t") return null;
        continue;
      }
      const quote = / {0,3}>( ?)/y;
      quote.lastIndex = at;
      const match = quote.exec(source);
      if (!match || match.index !== at) {
        // A lazy continuation line: nothing further to take off.
        while (at < end && source[at] === " ") at++;
        return at;
      }
      at += match[0].length;
      if (source[at] === "\t") return null;
    }
    return at;
  }

  const indents = new Map<Node, number | null>();
  function itemIndent(item: Node): number | null {
    if (indents.has(item)) return indents.get(item)!;
    const first = item.children?.[0];
    let width: number | null = null;
    if (first?.position) {
      const line = first.position.start.line - 1;
      const outer = place.get(item)?.prefixed ?? [];
      const start = contentStart(line, outer);
      if (start !== null) width = first.position.start.offset! - start;
    } else if (item.position) {
      width = 2;
    }
    if (
      width !== null &&
      (width < 0 ||
        source.slice(lineStarts[lineOf(item.position!.start.offset!)], item.position!.start.offset!).includes("\t"))
    ) {
      width = null;
    }
    indents.set(item, width);
    return width;
  }

  /** The text from `start` to `end` with every container prefix taken off the lines after the first. */
  function text(start: number, end: number, containers: Node[]): string | undefined {
    const first = lineOf(start);
    const last = lineOf(end);
    const parts = [source.slice(start, Math.min(end, lineEnd(first)))];
    for (let line = first + 1; line <= last; line++) {
      const at = contentStart(line, containers);
      if (at === null) return undefined;
      parts.push(source.slice(at, Math.min(end, lineEnd(line))));
    }
    return parts.join("\n");
  }

  // --- where each original node starts and ends ------------------------------
  const startOverride = new Map<Node, number>();
  for (const [node, where] of place) {
    // A callout's body can begin in the marker's own paragraph, which is then
    // the body paragraph's position; its text really begins on the next line.
    if (node.type !== "callout" || !node.position) continue;
    const body = node.children?.[0];
    if (body?.type === "paragraph" && body.position && body.position.start.line === node.position.start.line) {
      const at = contentStart(node.position.start.line, [...where.prefixed, node]);
      if (at !== null) startOverride.set(body, at);
    }
  }

  /** First line an attribute line of `node` could be on: below its parent's own opening line. */
  function floorLine(node: Node): number {
    const parent = place.get(node)?.parent;
    if (!parent || parent.type === "root") return -1;
    if (parent.type === "blockquote" || parent.type === "callout") return parent.position!.start.line - 2;
    if (parent.type === "column" && !parent.position) {
      const columns = place.get(parent)?.parent;
      return columns?.position ? columns.position.start.line - 1 : -1;
    }
    if (parent.type === "tab") return parent.position!.end.line - 1;
    return parent.position ? parent.position.start.line - 1 : -1;
  }

  function startOf(node: Node): number | undefined {
    const fixed = startOverride.get(node);
    if (fixed !== undefined) return fixed;
    if (!node.position) return undefined;
    let start = node.position.start.offset!;
    if (node.attributes && node.type !== "listItem") {
      const containers = place.get(node)?.prefixed ?? [];
      const floor = floorLine(node);
      for (let line = lineOf(start) - 1; line > floor; line--) {
        const at = contentStart(line, containers);
        if (at === null || !ATTRIBUTE_LINE.test(source.slice(at, lineEnd(line)))) break;
        start = at;
      }
    }
    return start;
  }

  /** The line holding a directive's closing fence, if it was written. */
  function closingLine(node: Node): number | undefined {
    if (!node.position) return undefined;
    const line = node.position.end.line - 1;
    if (line === node.position.start.line - 1) return undefined;
    const at = contentStart(line, place.get(node)?.prefixed ?? []);
    if (at === null) return undefined;
    return /^ {0,3}:{3,}[ \t]*$/.test(source.slice(at, lineEnd(line))) ? line : undefined;
  }

  function verbatim(node: Node): string | undefined {
    if (node.type === "tab" || node.type === "column") return undefined;
    const start = startOf(node);
    if (start === undefined || !node.position) return undefined;
    return text(start, node.position.end.offset!, place.get(node)?.prefixed ?? []);
  }

  // --- matching the edited tree against the original -------------------------
  const originOf = new Map<Node, Node>();
  const unchanged = new Set<Node>();

  function same(edited: Node, old: Node): void {
    originOf.set(edited, old);
    unchanged.add(edited);
    const oldLists = new Map(nodeLists(old));
    for (const [name, list] of nodeLists(edited)) {
      const counterpart = oldLists.get(name);
      if (!counterpart) continue;
      for (const [i, child] of list.entries()) same(child, counterpart[i]);
    }
  }

  /** In "blocks" depth, a changed top-level block is written fresh; only the blank lines around it are kept. */
  const spacingOnly = new Map<Node, Node>();

  function changed(edited: Node, old: Node): void {
    if (depth === "blocks" && edited !== (tree as Node)) {
      spacingOnly.set(edited, old);
      return;
    }
    originOf.set(edited, old);
    const oldLists = new Map(nodeLists(old));
    for (const [name, list] of nodeLists(edited)) {
      const counterpart = oldLists.get(name);
      if (counterpart) align(list, counterpart);
    }
  }

  /** Longest common subsequence by identity, then pair what is left between anchors by type, in order. */
  function align(edited: Node[], old: Node[]): void {
    const a = edited.map(key);
    const b = old.map(key);
    const n = a.length;
    const m = b.length;
    const table = new Uint32Array((n + 1) * (m + 1));
    const at = (i: number, j: number): number => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[at(i, j)] =
          a[i] === b[j] ? table[at(i + 1, j + 1)] + 1 : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
      }
    }
    const anchors: Array<[number, number]> = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        anchors.push([i, j]);
        i++;
        j++;
      } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
        i++;
      } else {
        j++;
      }
    }
    anchors.push([n, m]);
    let fromI = 0;
    let fromJ = 0;
    for (const [toI, toJ] of anchors) {
      let next = fromJ;
      const paired = new Set<number>();
      for (let x = fromI; x < toI; x++) {
        for (let y = next; y < toJ; y++) {
          if (edited[x].type === old[y].type) {
            changed(edited[x], old[y]);
            paired.add(x).add(-1 - y);
            next = y + 1;
            break;
          }
        }
      }
      // A block that changed type (a paragraph made a heading) is new content,
      // but it still stands where the old one stood, so it keeps that spacing.
      const leftEdited: Node[] = [];
      const leftOld: Node[] = [];
      for (let x = fromI; x < toI; x++) if (!paired.has(x)) leftEdited.push(edited[x]);
      for (let y = fromJ; y < toJ; y++) if (!paired.has(-1 - y)) leftOld.push(old[y]);
      if (leftEdited.length === leftOld.length) {
        for (const [i, node] of leftEdited.entries()) spacingOnly.set(node, leftOld[i]);
      }
      if (toI < n) same(edited[toI], old[toJ]);
      fromI = toI + 1;
      fromJ = toJ + 1;
    }
  }

  changed(tree as Node, oldRoot);
  const editedOf = new Map<Node, Node>();
  for (const [edited, old] of originOf) editedOf.set(old, edited);

  // --- the answers to-markdown.ts asks for ------------------------------------
  const origin = (node: Nodes): Node | undefined => originOf.get(node as Node);
  const ownFieldsUnchanged = (node: Nodes): Node | undefined => {
    const old = origin(node);
    return old && headKey(node as Node, key) === headKey(old, key) ? old : undefined;
  };
  /** The original text between two offsets on different lines, prefixes taken off: the separator to reuse. */
  const between = (from: number | undefined, to: number | undefined, containers: Node[]): string | undefined => {
    if (from === undefined || to === undefined || lineOf(to) <= lineOf(from)) return undefined;
    return text(from, to, containers);
  };
  const endOffset = (old: Node): number | undefined => {
    if (old.type === "tab" || old.type === "column") {
      const last = old.children?.at(-1);
      if (last) return endOffset(last);
    }
    return old.position?.end.offset;
  };
  const startOffset = (old: Node): number | undefined => {
    if (old.type === "column" && !old.position) {
      const first = old.children?.[0];
      return first ? startOffset(first) : undefined;
    }
    return startOf(old);
  };
  const openingEnd = (old: Node): number | undefined => {
    if (!old.position) return undefined;
    if (old.type === "tab" || old.type === "column") return old.position.end.offset;
    return lineEnd(old.position.start.line - 1);
  };

  /** A list or item keeps its original spacing only while it is still as loose, or as tight, as it was. */
  const spreadAgrees = (parent: Node | undefined, separator: string | undefined): string | undefined => {
    if (separator === undefined || !parent || !("spread" in parent) || typeof parent.spread !== "boolean") {
      return separator;
    }
    return /\n[ \t]*\n/.test(separator) === parent.spread ? separator : undefined;
  };

  const hints: PatchHints = {
    opening(node) {
      const old = ownFieldsUnchanged(node);
      if (!old?.position) return undefined;
      const prefixed = place.get(old)?.prefixed ?? [];
      if (old.type === "callout") {
        const line = old.position.start.line - 1;
        const at = contentStart(line, [...prefixed, old]);
        return at === null ? undefined : source.slice(at, lineEnd(line));
      }
      if (old.type === "tab") {
        const start = startOf(old);
        return start === undefined ? undefined : text(start, old.position.end.offset!, prefixed);
      }
      if (old.type === "column") return text(old.position.start.offset!, old.position.end.offset!, prefixed);
      const start = old.position.start.offset!;
      return source.slice(start, lineEnd(lineOf(start)));
    },
    fence(node) {
      const old = origin(node);
      if (!old?.position || !("name" in old || CONSTRUCT_FENCES.has(old.type))) return undefined;
      return /^:*/.exec(source.slice(old.position.start.offset!))![0].length || undefined;
    },
    closing(node, fence) {
      const old = origin(node);
      const line = old && closingLine(old);
      if (line === undefined) return undefined;
      const at = contentStart(line, place.get(old!)?.prefixed ?? [])!;
      const value = source.slice(at, lineEnd(line));
      return (/^ *(:+)/.exec(value)?.[1].length ?? 0) >= fence ? value : undefined;
    },
    afterOpening(node, first) {
      const old = origin(node);
      const oldFirst = origin(first) ?? spacingOnly.get(first as Node);
      const where = oldFirst && place.get(oldFirst);
      if (!old || !where || where.parent !== old || where.index !== 0) return undefined;
      return between(openingEnd(old), startOffset(oldFirst!), where.prefixed);
    },
    beforeClosing(node, last) {
      const old = origin(node);
      const oldLast = origin(last) ?? spacingOnly.get(last as Node);
      const where = oldLast && place.get(oldLast);
      const line = old && closingLine(old);
      if (!where || line === undefined || where.parent !== old || where.index !== where.list.length - 1)
        return undefined;
      const closingStart = contentStart(line, place.get(old!)?.prefixed ?? []) ?? undefined;
      return between(endOffset(oldLast!), closingStart, where.prefixed);
    },
    between(left, right) {
      const oldLeft = origin(left) ?? spacingOnly.get(left as Node);
      const oldRight = origin(right) ?? spacingOnly.get(right as Node);
      const l = oldLeft && place.get(oldLeft);
      const r = oldRight && place.get(oldRight);
      if (!l || !r || l.list !== r.list || r.index !== l.index + 1) return undefined;
      return spreadAgrees(editedOf.get(l.parent), between(endOffset(oldLeft!), startOffset(oldRight!), l.prefixed));
    },
    itemAttributeLines(item) {
      const old = origin(item);
      const self = item as Node;
      if (!old?.position || !old.attributes || key(self.attributes) !== key(old.attributes)) return undefined;
      const width = itemIndent(old);
      const first = old.children?.[0];
      if (width === null) return undefined;
      const prefixed = [...(place.get(old)?.prefixed ?? []), old];
      const firstLine = old.position.start.line - 1;
      const lastLine = (first ? first.position!.start.line - 1 : old.position.end.line) - 1;
      let end = lastLine;
      while (end > firstLine && /^\s*$/.test(source.slice(contentStart(end, prefixed) ?? 0, lineEnd(end)))) end--;
      const start = contentStart(firstLine, prefixed);
      return start === null ? undefined : text(start, lineEnd(end), prefixed);
    },
    wrap(type, base) {
      bases.set(type, base);
      const wrapped: Handler = (node, parent, state, info) => {
        const self = node as Node;
        if (unchanged.has(self) && !besideChangedText(self, parent)) {
          const old = originOf.get(self)!;
          const copy = verbatim(old);
          if (copy !== undefined) return copy;
        }
        const old = originOf.get(self);
        if (!old) return base(node, parent, state, info);
        if (type === "table") return table(self, old, state, info, base, parent);
        return withStyle(self, old, state, () =>
          keepingAttributeLines(self, old, () => base(node, parent, state, info)),
        );
      };
      if (base.peek) {
        wrapped.peek = (node, parent, state, info) => {
          const self = node as Node;
          const copy = unchanged.has(self) ? verbatim(originOf.get(self)!) : undefined;
          return copy ?? base.peek!(node, parent, state, info);
        };
      }
      return wrapped;
    },
    leading(edited) {
      const first = edited.children[0] as Node | undefined;
      const old = first && (originOf.get(first) ?? spacingOnly.get(first));
      if (!old || old !== oldRoot.children?.[0]) return undefined;
      const start = startOf(old);
      return start === undefined ? undefined : source.slice(0, start);
    },
    trailing(edited) {
      const last = edited.children.at(-1) as Node | undefined;
      const old = last && (originOf.get(last) ?? spacingOnly.get(last));
      if (!old?.position || old !== oldRoot.children?.at(-1)) return undefined;
      // Whatever followed the last block, such as an orphaned attribute line, stays.
      const after = source.slice(old.position.end.offset!);
      return after;
    },
    emptyDocument() {
      return /^\s*$/.test(source) ? source : "";
    },
  };

  const bases = new Map<string, Handler>();

  /** A changed block whose attributes did not change keeps its attribute lines as written, however many there were. */
  function keepingAttributeLines(node: Node, old: Node, run: () => string): string {
    if (!node.attributes || node.type === "listItem" || key(node.attributes) !== key(old.attributes)) return run();
    const start = startOf(old);
    if (start === undefined || start === old.position!.start.offset) return run();
    const lines = text(start, old.position!.start.offset!, place.get(old)?.prefixed ?? []);
    if (lines === undefined) return run();
    const attributes = node.attributes;
    delete node.attributes;
    try {
      return lines + run();
    } finally {
      node.attributes = attributes;
    }
  }

  /**
   * Emphasis and strong are only emphasis while the characters beside their
   * markers allow it (CommonMark's flanking rules), so a copied `*x*` next to
   * edited text can stop being emphasis. Written fresh, mdast-util-to-markdown
   * encodes the neighbour that would break it.
   */
  function besideChangedText(node: Node, parent: Parameters<Handle>[1]): boolean {
    if (node.type !== "emphasis" && node.type !== "strong") return false;
    const siblings = (parent as { children?: Node[] } | undefined)?.children ?? [];
    const index = siblings.indexOf(node);
    return [siblings[index - 1], siblings[index + 1]].some((sibling) => sibling && !unchanged.has(sibling));
  }

  /** Serialize a changed node with the markers its original used, so it keeps its author's style. */
  function withStyle(node: Node, old: Node, state: State, run: () => string): string {
    const saved = { ...state.options };
    const first = old.position ? source[old.position.start.offset!] : undefined;
    if (node.type === "list" && first) {
      if (node.ordered) {
        const delimiter = /^\d+([.)])/.exec(source.slice(old.position!.start.offset!))?.[1];
        if (delimiter === "." || delimiter === ")") state.options.bulletOrdered = delimiter;
      } else if (first === "-" || first === "*" || first === "+") {
        state.options.bullet = first;
        state.options.bulletOther = first === "-" ? "*" : "-";
      }
    } else if ((node.type === "emphasis" || node.type === "strong") && (first === "*" || first === "_")) {
      state.options[node.type] = first;
    } else if (node.type === "code" && (first === "`" || first === "~")) {
      state.options.fence = first;
    } else if (node.type === "heading" && first !== undefined && first !== "#") {
      state.options.setext = true;
    }
    try {
      return run();
    } finally {
      state.options = saved;
    }
  }

  /**
   * A changed table keeps every row it did not change, as the author aligned
   * it. Re-padding the whole table would put every row in the diff for one cell.
   */
  function table(
    node: Node,
    old: Node,
    state: State,
    info: Parameters<Handle>[3],
    base: Handle,
    parent: Parameters<Handle>[1],
  ): string {
    const rows = node.children ?? [];
    const oldRows = old.children ?? [];
    const align = (node as { align?: unknown }).align;
    const width = rows[0]?.children?.length ?? 0;
    const prefixed = place.get(old)?.prefixed ?? [];
    const delimiterLine = oldRows[0]?.position ? oldRows[0].position.end.line : undefined;
    let delimiter: string | undefined;
    if (
      delimiterLine !== undefined &&
      key(align) === key((old as { align?: unknown }).align) &&
      width === (oldRows[0]?.children?.length ?? -1)
    ) {
      const at = contentStart(delimiterLine, prefixed);
      if (at !== null) delimiter = source.slice(at, lineEnd(delimiterLine));
    }
    if (delimiter === undefined) return base(node as Nodes, parent, state, info);
    // A cell's position includes its pipes, so a cell is never copied whole; its inline content still is.
    const cell = bases.get("tableCell")!;
    const exit = state.enter("table");
    // An author who padded the table to its columns gets a rewritten row padded
    // the same way, where its cells still fit. The delimiter row says how wide
    // each column was: `|---------|` is a seven-character column with a space each side.
    const widths = /^\|(?:[ :-]+\|)+$/.test(delimiter.trim())
      ? delimiter
          .trim()
          .slice(1, -1)
          .split("|")
          .map((part) => part.length - 2)
      : [];
    const lines = rows.map((row) => {
      const copy = unchanged.has(row) ? verbatim(originOf.get(row)!) : undefined;
      if (copy !== undefined) return copy;
      const cells = (row.children ?? []).map((child, i) => {
        const value = cell(child as Nodes, row as never, state, info);
        const width = widths[i] ?? 0;
        return value.length < width ? value.padEnd(width) : value;
      });
      return `| ${cells.join(" | ")} |`;
    });
    exit();
    const attributes = (node as { attributes?: Attributes }).attributes;
    const attributeLine = attributes ? `${stringifyAttributes(attributes)}\n` : "";
    return attributeLine + [lines[0], delimiter, ...lines.slice(1)].join("\n");
  }

  return hints;
}
