/**
 * mdast-util-to-markdown extension that writes Markset source: the §4 construct
 * nodes, generic directives and separators (§2.3, §2.4), bracketed spans
 * (§2.2), and the attribute lines (§2.5) that blocks carry.
 *
 * This is the inverse of parseDocument, not of the downgrade: its output parses
 * back to the tree it was given. The serialization choices are the ones §3 fixes
 * for the downgrade renderer, so the two agree wherever they overlap.
 *
 * `hints` is how serializeDocument (serialize.ts) reuses the original source
 * for the parts of a construct an edit left alone: an unchanged fence line, the
 * blank lines an author put between blocks. Without hints every choice is the
 * canonical one.
 */
import type { Heading, Nodes, Paragraph, PhrasingContent } from "mdast";
import type { Handle, Info, Join, Options, State, Unsafe } from "mdast-util-to-markdown";
import type { Attributes } from "./attributes.ts";
import type {
  Callout,
  Card,
  Column,
  Columns,
  ConstructBase,
  Directive,
  Figure,
  Grid,
  Metrics,
  SeparatorNode,
  Span,
  Steps,
  Tabs,
} from "./ast.ts";

/**
 * What serializeDocument knows about the original source, asked per node.
 * Every answer may be undefined, which means "write it the canonical way".
 * The separators are literal text from the original, newlines included, so
 * whatever sat between two blocks that the tree does not hold (an orphaned
 * attribute line, a stray fence) survives an edit elsewhere.
 */
export interface SourceHints {
  /** The original opening line of a construct whose own fields are unchanged: fence line, callout marker, tab heading, `::col`. */
  opening(node: Nodes): string | undefined;
  /** How many colons the original fence of a directive had. */
  fence(node: Nodes): number | undefined;
  /** The original closing fence of a directive, when it has at least `fence` colons. */
  closing(node: Nodes, fence: number): string | undefined;
  /** What the original had between a construct's opening line and its first child. */
  afterOpening(node: Nodes, first: Nodes): string | undefined;
  /** What the original had between a directive's last child and its closing fence. */
  beforeClosing(node: Nodes, last: Nodes): string | undefined;
  /** What the original had between two siblings, when they were adjacent there. */
  between(left: Nodes, right: Nodes): string | undefined;
  /** A list item's original leading attribute lines (§2.5), without the marker, when its attributes are unchanged. */
  itemAttributeLines(item: Nodes): string | undefined;
}

/** The fixed serialization choices of §3. */
export const CANONICAL_OPTIONS: Options = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fences: true,
  rule: "-",
  listItemIndent: "one",
};

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;
const BARE_VALUE = /^[^\s}"']+$/;

/** Write an attribute specifier (§2.1), braces included. Throws on what the grammar cannot express. */
export function stringifyAttributes(attributes: Pick<Attributes, "id" | "classes" | "attrs">): string {
  const items: string[] = [];
  if (attributes.id !== null) items.push(`#${identifier(attributes.id)}`);
  for (const name of attributes.classes) items.push(`.${identifier(name)}`);
  for (const [key, value] of Object.entries(attributes.attrs))
    items.push(`${identifier(key)}=${attributeValue(value)}`);
  return `{${items.join(" ")}}`;
}

/** The specifier, or nothing when it would be empty: directives and separators need not write `{}`. */
function optionalAttributes(attributes: Pick<Attributes, "id" | "classes" | "attrs">): string {
  const empty = attributes.id === null && attributes.classes.length === 0 && Object.keys(attributes.attrs).length === 0;
  return empty ? "" : stringifyAttributes(attributes);
}

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`"${name}" is not an identifier (§2.1)`);
  return name;
}

function attributeValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("an attribute value cannot span lines (§2.1)");
  if (BARE_VALUE.test(value)) return value;
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** Longest run of colons opening any line of `text`, counting only runs a fence could be. */
function longestColonRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/^[ \t]*(:{3,})/gm)) longest = Math.max(longest, match[1].length);
  return longest;
}

/** §3: these three merge into a fence line under a stock parser unless a blank line separates them. */
function needsBlankAfterFence(first: Nodes | undefined): boolean {
  return first?.type === "list" && first.ordered === true && first.start != null && first.start !== 1;
}

const ATTRIBUTE_LINE = "marksetAttributeLine";

/** A handler, with the `peek` mdast-util-to-markdown looks for to learn a node's first character. */
export type Handler = Handle & { peek?: Handle };

interface AttributeLineNode {
  type: typeof ATTRIBUTE_LINE;
  attributes: Attributes;
  /** The original lines, when the attributes did not change. */
  written?: string;
}

export function marksetToMarkdown(hints?: SourceHints): Options {
  function phrasing(state: State, info: Info, children: PhrasingContent[], before: string, after: string): string {
    const holder: Paragraph = { type: "paragraph", children };
    return state.containerPhrasing(holder, { ...info, before, after });
  }

  /** Opening fence, content, closing fence (§2.3), keeping the original fence lines where they still fit. */
  function fenced(
    node: Nodes,
    freshHead: string,
    content: string,
    first: Nodes | undefined,
    last: Nodes | undefined,
  ): string {
    const needed = Math.max(3, longestColonRun(content) + 1);
    const reused = hints?.opening(node);
    const reusedFence = reused ? (/^:+/.exec(reused)?.[0].length ?? 0) : 0;
    // A changed fence line keeps the author's fence length when it still fits.
    const fence =
      reused !== undefined && reusedFence >= needed ? reusedFence : Math.max(needed, hints?.fence(node) ?? 0);
    const head = reused !== undefined && reusedFence >= needed ? reused : ":".repeat(fence) + freshHead;
    const tail = hints?.closing(node, fence) ?? ":".repeat(fence);
    if (content === "") return `${head}\n${tail}`;
    let lead = (first && hints?.afterOpening(node, first)) ?? "\n";
    if (needsBlankAfterFence(first) && !/\n[ \t]*\n/.test(lead)) lead = "\n\n";
    const trail = (last && hints?.beforeClosing(node, last)) ?? "\n";
    return head + lead + content + trail + tail;
  }

  function argument(state: State, info: Info, children: PhrasingContent[] | null): string {
    if (children === null) return "";
    const exit = state.enter("label");
    const value = `[${phrasing(state, info, children, "[", "]")}]`;
    exit();
    if (/[\r\n]/.test(value)) throw new Error("a directive argument cannot span lines (§2.3)");
    return value;
  }

  function flow(state: State, info: Info, node: { children: unknown[] }): string {
    return node.children.length === 0 ? "" : state.containerFlow(node as never, info);
  }

  function directiveHandler(
    name: string,
    attrs: (node: never) => Record<string, string>,
    arg?: (node: never) => PhrasingContent[] | null,
  ): Handle {
    return (node, _, state, info) => {
      const construct = node as unknown as ConstructBase & { children: Nodes[] };
      const exit = state.enter("marksetDirective" as never);
      const content = flow(state, info, construct);
      const head =
        name +
        argument(state, info, arg ? arg(node as never) : null) +
        optionalAttributes({ id: construct.id, classes: construct.classes, attrs: attrs(node as never) });
      const children = construct.children;
      const value = fenced(node as Nodes, head, content, children[0], children.at(-1));
      exit();
      return value;
    };
  }

  const card = directiveHandler(
    "card",
    (node: Card) => ({
      ...(node.tone === "neutral" ? {} : { tone: node.tone }),
      ...(node.compact ? { compact: "true" } : {}),
    }),
    (node: Card) => node.title,
  );
  const grid = directiveHandler("grid", (node: Grid) => ({
    ...(node.cols === 2 ? {} : { cols: String(node.cols) }),
    ...(node.gap === "md" ? {} : { gap: node.gap }),
  }));
  const steps = directiveHandler("steps", (_: Steps) => ({}));
  const metrics = directiveHandler(
    "metrics",
    (node: Metrics): Record<string, string> => (node.direction === "normal" ? {} : { direction: node.direction }),
  );
  const figure = directiveHandler(
    "figure",
    (node: Figure) => ({
      ...(node.width === null ? {} : { width: `${node.width}%` }),
      ...(node.chart ? { chart: node.chart } : {}),
    }),
    (node: Figure) => node.caption,
  );

  const tabs: Handle = (node, _, state, info) => {
    const construct = node as unknown as Tabs;
    const exit = state.enter("marksetDirective" as never);
    let content = "";
    construct.children.forEach((tab, index) => {
      const synthetic: Heading = { type: "heading", depth: tab.depth, children: tab.label };
      if (tab.attributes) synthetic.attributes = tab.attributes;
      let chunk = hints?.opening(tab) ?? state.handle(synthetic, construct as never, state, info);
      const body = flow(state, info, tab);
      if (body !== "") chunk += (hints?.afterOpening(tab, tab.children[0]) ?? "\n\n") + body;
      if (index > 0) content += hints?.between(construct.children[index - 1], tab) ?? "\n\n";
      content += chunk;
    });
    const head = `tabs${optionalAttributes({
      id: construct.id,
      classes: construct.classes,
      attrs: construct.active === 1 ? {} : { active: String(construct.active) },
    })}`;
    const value = fenced(construct, head, content, construct.children[0], construct.children.at(-1));
    exit();
    return value;
  };

  const columns: Handle = (node, _, state, info) => {
    const construct = node as unknown as Columns;
    const exit = state.enter("marksetDirective" as never);
    const [first] = construct.children;
    if (first && (first.id !== null || first.classes.length > 0)) {
      throw new Error("the first column has no `::col` line, so it cannot carry an id or classes (§4.4)");
    }
    let content = "";
    let previous: Column | undefined;
    construct.children.forEach((column, index) => {
      const body = flow(state, info, column);
      let chunk = body;
      if (index > 0) {
        const separator = hints?.opening(column) ?? `::col${optionalAttributes({ ...column, attrs: {} })}`;
        chunk =
          body === "" ? separator : separator + (hints?.afterOpening(column, column.children[0]) ?? "\n\n") + body;
      }
      if (chunk === "") return;
      if (previous) content += hints?.between(previous, column) ?? "\n\n";
      content += chunk;
      previous = column;
    });
    const attrs: Record<string, string> = {};
    if (construct.ratio) attrs.ratio = construct.ratio.join(":");
    if (construct.gap !== "md") attrs.gap = construct.gap;
    const head = `columns${optionalAttributes({ id: construct.id, classes: construct.classes, attrs })}`;
    const value = fenced(construct, head, content, first, construct.children.at(-1));
    exit();
    return value;
  };

  const directive: Handle = (node, _, state, info) => {
    const generic = node as unknown as Directive;
    const exit = state.enter("marksetDirective" as never);
    const content = flow(state, info, generic);
    // A fence with no name is only an opening fence while something follows the
    // colons, so a nameless one keeps its specifier even when it is empty.
    const attributes =
      generic.name === null ? stringifyAttributes(generic.attributes) : optionalAttributes(generic.attributes);
    const head = (generic.name ?? "") + argument(state, info, generic.argument) + attributes;
    const value = fenced(generic, head, content, generic.children[0], generic.children.at(-1));
    exit();
    return value;
  };

  const separator: Handle = (node) => {
    const line = node as unknown as SeparatorNode;
    return `::${identifier(line.name)}${optionalAttributes(line.attributes)}`;
  };

  const callout: Handle = (node, _, state, info) => {
    const construct = node as unknown as Callout;
    const exit = state.enter("blockquote");
    let head = hints?.opening(construct);
    if (head === undefined) {
      const fold = construct.fold === "closed" ? "-" : construct.fold === "open" ? "+" : "";
      head = `[!${construct.kind}]${fold}`;
      if (construct.title) head += ` ${phrasing(state, info, construct.title, " ", "\n")}`;
    }
    const body = flow(state, info, construct);
    const [first] = construct.children;
    const value = body === "" ? head : head + ((first && hints?.afterOpening(construct, first)) ?? "\n\n") + body;
    exit();
    return state.indentLines(value, (line, _index, blank) => `>${blank ? "" : " "}${line}`);
  };

  const span: Handler = (node, _, state, info) => {
    const inline = node as unknown as Span;
    const exit = state.enter("label");
    const value = `[${phrasing(state, info, inline.children, "[", "]")}]${stringifyAttributes(inline.attributes)}`;
    exit();
    return value;
  };
  span.peek = () => "[";

  const attributeLine: Handle = (node) => {
    const line = node as unknown as AttributeLineNode;
    return line.written ?? stringifyAttributes(line.attributes);
  };

  const join: Join[] = [
    (left, _right, parent) => {
      // A blank line after an item's attribute line is what makes a one-block item
      // loose. With more blocks, the gaps between them say so instead.
      if ((left as { type: string }).type === ATTRIBUTE_LINE) {
        const item = parent as { spread?: boolean; children: unknown[] };
        return item.spread && item.children.length === 2 ? 1 : 0;
      }
      return undefined;
    },
  ];

  // Characters that would open a Markset construct where the author wrote text.
  const unsafe: Unsafe[] = [
    { character: ":", atBreak: true, after: ":" },
    { character: "{", atBreak: true, inConstruct: "phrasing" },
  ];

  return {
    handlers: {
      card,
      grid,
      columns,
      tabs,
      steps,
      metrics,
      figure,
      directive,
      separator,
      callout,
      span,
      [ATTRIBUTE_LINE]: attributeLine,
    } as unknown as Options["handlers"],
    join,
    unsafe,
  };
}

/** Wrap a block handler so a block carrying `attributes` gets its attribute line (§2.5). */
export function withAttributeLine(type: string, base: Handler, hints?: SourceHints): Handler {
  if (type === "listItem") {
    // An item's attributes are the first line of the item itself, `- {.hot}`,
    // so they go in as a leading child and the item's own indentation follows.
    return (node, parent, state, info) => {
      const item = node as unknown as { attributes?: Attributes; children: unknown[] };
      if (!item.attributes) return base(node, parent, state, info);
      const children = item.children;
      const line: AttributeLineNode = { type: ATTRIBUTE_LINE, attributes: item.attributes };
      const written = hints?.itemAttributeLines(node);
      if (written !== undefined) line.written = written;
      item.children = [line, ...children];
      try {
        return base(node, parent, state, info);
      } finally {
        item.children = children;
      }
    };
  }
  const wrapped: Handler = (node, parent, state, info) => {
    const attributes = (node as { attributes?: Attributes }).attributes;
    if (!attributes) return base(node, parent, state, info);
    // `---` after an attribute line reads as a setext heading to a stock parser (§2.5).
    const rule = state.options.rule;
    if (type === "thematicBreak") state.options.rule = "*";
    try {
      return `${stringifyAttributes(attributes)}\n${base(node, parent, state, info)}`;
    } finally {
      state.options.rule = rule;
    }
  };
  if (base.peek) wrapped.peek = base.peek;
  return wrapped;
}

/** Block types an attribute line can reach (§2.5), plus the list item's own form. */
export const ATTRIBUTABLE = [
  "paragraph",
  "heading",
  "list",
  "listItem",
  "table",
  "code",
  "blockquote",
  "thematicBreak",
  "html",
  "callout",
] as const;
