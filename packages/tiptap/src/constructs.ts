/**
 * The eight constructs as a TipTap extension that sits beside a host's own
 * schema: StarterKit, TableKit, task lists, a block image. It holds only what
 * Markset adds: the construct nodes, the `directive`, `directiveArgument` and
 * `separator` nodes an unknown or invalid construct is kept in, the commands
 * that insert, change and remove a construct, guards that check construct
 * nodes alone, and Enter in a construct's title. The `Markset` kit in
 * extensions.ts is this plus the CommonMark nodes, the marks, the kit's keys,
 * undo and diagnostics, so there is one implementation of each construct.
 *
 * The schema carries most of §4 by itself: a grid holds exactly one list, steps
 * one ordered list, metrics one table, a figure one image, table or code block.
 * What a content expression cannot say — a metrics table's column count, a
 * columns ratio matching its columns, tab headings at one level — the guards
 * enforce.
 */
import { Extension, Node, type AnyExtension, type Editor, type NodeViewRenderer } from "@tiptap/core";
import type { DOMOutputSpec, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { constructTemplate, mdastToJSON, type ConvertHost } from "./convert.ts";
import {
  ALLOWED,
  CONSTRUCTS,
  NODE_ATTRIBUTES,
  type BlockAttributes,
  type ConstructName,
  type JSONNode,
  type NodeName,
} from "./model.ts";

// ---------------------------------------------------------------------------
// Attributes round-trip through the DOM as one JSON attribute. ProseMirror's
// clipboard serializes a copied slice with renderHTML and reads it back with
// parseHTML, so this is what keeps a pasted card a card with its tone.

export const ATTRS = "data-ms-attrs";

export function attributeSpec(defaults: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [
      name,
      {
        default: value,
        parseHTML: (element: HTMLElement) => readAttrs(element)?.[name],
        renderHTML: () => ({}),
      },
    ]),
  );
}

function readAttrs(element: HTMLElement): Record<string, unknown> | undefined {
  const raw = element.getAttribute(ATTRS);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The §2.5 attributes of a block as HTML: id, the classes after `first`, and one `data-` attribute per key. */
export function blockHtml(attributes: BlockAttributes, first?: string): Record<string, string> {
  const html: Record<string, string> = {};
  const classes = [first, ...(attributes?.classes ?? [])].filter(Boolean);
  if (classes.length > 0) html.class = classes.join(" ");
  if (attributes?.id) html.id = attributes.id;
  for (const [key, value] of Object.entries(attributes?.attrs ?? {})) html[`data-${key}`] = value;
  return html;
}

function identityHtml(node: PMNode, first: string): Record<string, string> {
  return blockHtml({ id: node.attrs.id, classes: node.attrs.classes, attrs: {} }, first);
}

function tagged(node: PMNode, html: Record<string, string>): Record<string, string> {
  return { "data-ms": node.type.name, [ATTRS]: JSON.stringify(node.attrs), ...html };
}

/**
 * The element a node is drawn as, and its attributes: what renderHTML emits and
 * what a node view that replaces it should put on its wrapper to keep the
 * stylesheet's hold on it.
 */
export function elementFor(node: PMNode): { tag: string; attributes: Record<string, string> } {
  const a = node.attrs;
  const own = (tag: string, html: Record<string, string>) => ({ tag, attributes: tagged(node, html) });
  switch (node.type.name as NodeName) {
    case "callout":
      return own("div", {
        ...blockHtml(a.attributes, "ms-callout"),
        "data-type": String(a.kind).toLowerCase(),
        ...(a.fold ? { "data-fold": a.fold } : {}),
        role: "note",
      });
    case "calloutTitle":
      return own("div", { class: "ms-callout-title" });
    case "card":
      return own("section", {
        ...identityHtml(node, "ms-card"),
        "data-tone": a.tone,
        ...(a.compact ? { "data-compact": "" } : {}),
      });
    case "cardTitle":
      return own("h3", { class: "ms-card-title" });
    case "grid":
      return own("div", { ...identityHtml(node, "ms-grid"), "data-cols": String(a.cols), "data-gap": a.gap });
    case "columns": {
      const ratio = a.ratio as number[] | null;
      return own("div", {
        ...identityHtml(node, "ms-columns"),
        "data-gap": a.gap,
        ...(ratio ? { style: `--ms-ratio: ${ratio.map((n) => `${n}fr`).join(" ")}` } : {}),
      });
    }
    case "column":
      return own("div", identityHtml(node, "ms-column"));
    case "tabs":
      return own("div", { ...identityHtml(node, "ms-tabs"), "data-active": String(a.active) });
    // Every panel is shown while editing; the rendered page is where tabs hide
    // all but one. So a tab here is not an `ms-tabpanel`, which the stylesheet hides.
    case "tab":
      return own("div", { ...blockHtml(a.attributes, "ms-tab-editor"), "data-depth": String(a.depth) });
    case "tabLabel":
      return own("div", { class: "ms-tab" });
    case "steps":
      return own("div", identityHtml(node, "ms-steps"));
    case "metrics":
      return own("div", { ...identityHtml(node, "ms-metrics"), "data-direction": a.direction });
    case "figure":
      return own("figure", {
        ...identityHtml(node, "ms-figure"),
        ...(a.width !== null ? { style: `--ms-width: ${a.width}%` } : {}),
        ...(a.chart ? { "data-chart": a.chart } : {}),
      });
    case "figureCaption":
      return own("figcaption", {});
    case "directive":
      return own("div", { class: "ms-directive", "data-name": a.name ?? "", "data-invalid": "" });
    case "directiveArgument":
      return own("div", { class: "ms-directive-argument" });
    default:
      return own("div", {});
  }
}

// ---------------------------------------------------------------------------
// Nodes

export interface NodeOptions {
  /** Replaces the node's rendering in the editor. Set through the `nodeViews` option. */
  nodeView: NodeViewRenderer | null;
}

export function node(
  name: NodeName,
  config: {
    group?: string;
    content?: string;
    inline?: boolean;
    atom?: boolean;
    defining?: boolean;
    isolating?: boolean;
    code?: boolean;
    marks?: string;
    selectable?: boolean;
    draggable?: boolean;
    whitespace?: "pre" | "normal";
    topNode?: boolean;
    parse?: Array<{ tag: string; getAttrs?: (element: HTMLElement) => Record<string, unknown> | false | null }>;
    render?: (node: PMNode) => DOMOutputSpec;
  },
) {
  const defaults = NODE_ATTRIBUTES[name] as Record<string, unknown>;
  const { parse, render, ...spec } = config;
  return Node.create<NodeOptions>({
    name,
    ...spec,
    addOptions: () => ({ nodeView: null }),
    addAttributes: () => attributeSpec(defaults),
    parseHTML: () => [
      { tag: `[data-ms="${name}"]`, priority: 100 },
      ...(parse ?? []).map((rule) => ({ ...rule, priority: 50 })),
    ],
    renderHTML: ({ node }) => {
      if (render) return render(node);
      const { tag, attributes } = elementFor(node);
      return config.atom || name === "figureImage" ? [tag, attributes] : [tag, attributes, 0];
    },
    addNodeView() {
      return this.options.nodeView;
    },
  });
}

// ---------------------------------------------------------------------------
// The construct nodes

/** The content expressions a host's schema decides. */
interface Shapes {
  titleContent: string;
  listContent: string;
  tableNode: string;
  imageNode: string;
  figureContent: string;
}

function constructNodes(shapes: Shapes) {
  const title = shapes.titleContent;
  return [
    node("callout", { group: "block", content: "calloutTitle block*", defining: true }),
    node("calloutTitle", { content: title, whitespace: "pre", defining: true }),
    node("card", { group: "block", content: "cardTitle? block*", defining: true }),
    node("cardTitle", { content: title, whitespace: "pre", defining: true }),
    node("grid", { group: "block", content: shapes.listContent, defining: true }),
    node("columns", { group: "block", content: "column+", defining: true }),
    node("column", { content: "block*", defining: true }),
    node("tabs", { group: "block", content: "tab+", defining: true }),
    node("tab", { content: "tabLabel block*", defining: true }),
    node("tabLabel", { content: title, whitespace: "pre", defining: true }),
    node("steps", { group: "block", content: "orderedList", defining: true }),
    node("metrics", { group: "block", content: shapes.tableNode, defining: true }),
    node("figure", { group: "block", content: shapes.figureContent, defining: true }),
    node("figureCaption", { content: title, whitespace: "pre", defining: true }),
    // The kit's own image for a figure. A host that names its block image as `imageNode` draws that instead.
    ...(shapes.imageNode === "figureImage"
      ? [
          node("figureImage", {
            atom: true,
            render: (n) => [
              "img",
              {
                "data-ms": "figureImage",
                [ATTRS]: JSON.stringify(n.attrs),
                src: n.attrs.src,
                ...(n.attrs.alt ? { alt: n.attrs.alt } : {}),
              },
            ],
          }),
        ]
      : []),
    node("directive", { group: "block", content: "directiveArgument? block*", defining: true }),
    node("directiveArgument", { content: title, whitespace: "pre", defining: true }),
    node("separator", {
      group: "block",
      atom: true,
      render: (n) => [
        "div",
        { "data-ms": "separator", [ATTRS]: JSON.stringify(n.attrs), class: "ms-separator", "data-invalid": "" },
        `::${n.attrs.name}`,
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Commands

/** The canonical new instance of a construct, as JSON for a schema described by `host`. */
export function constructFor(name: ConstructName, host: ConvertHost = {}): JSONNode {
  return mdastToJSON({ type: "root", children: [constructTemplate(name)] }, host).content![0];
}

const CONSTRUCT_NAMES = new Set<string>(CONSTRUCTS);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    marksetConstructs: {
      /** Insert a new construct at the selection. */
      insertConstruct: (name: ConstructName) => ReturnType;
      /** Change the attributes of the innermost construct around the selection. Refused when a value is not one §4 allows. */
      setConstructAttributes: (attributes: Record<string, unknown>, name?: ConstructName) => ReturnType;
      /** Remove the innermost construct around the selection, or the innermost one named. */
      removeConstruct: (name?: ConstructName) => ReturnType;
    };
  }
}

export function innermost(
  state: {
    selection: { $from: { depth: number; node: (depth: number) => PMNode; before: (depth: number) => number } };
  },
  test: (node: PMNode) => boolean,
) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const found = $from.node(depth);
    if (test(found)) return { node: found, pos: $from.before(depth) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Guards

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** What in `doc` no Markset source can say, and no normalization can fix. Empty for a document the editor may hold. */
export function problems(doc: PMNode): string[] {
  return check(doc, false);
}

/**
 * The same, for the construct nodes alone: what the guards of
 * `MarksetConstructs` count, in a host whose other nodes are its own business.
 */
export function constructProblems(doc: PMNode): string[] {
  return check(doc, true);
}

/** Construct nodes, whose fields and attributes the guards check in a host's schema too. */
const CONSTRUCT_NODES = new Set([
  "callout",
  "card",
  "grid",
  "columns",
  "column",
  "tabs",
  "tab",
  "steps",
  "metrics",
  "figure",
]);

function check(doc: PMNode, constructsOnly: boolean): string[] {
  const found: string[] = [];
  const identity = (n: PMNode, what: string) => {
    if (n.attrs.id !== null && !IDENTIFIER.test(n.attrs.id))
      found.push(`${what}: id "${n.attrs.id}" is not an identifier`);
    for (const name of (n.attrs.classes as string[]) ?? []) {
      if (!IDENTIFIER.test(name)) found.push(`${what}: class "${name}" is not an identifier`);
    }
  };
  const oneOf = (value: unknown, allowed: readonly unknown[], what: string) => {
    if (!allowed.includes(value)) found.push(`${what}: ${JSON.stringify(value)} is not one of ${allowed.join(", ")}`);
  };
  const integer = (value: unknown, min: number, max: number, what: string) => {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      found.push(`${what}: ${JSON.stringify(value)} is not an integer from ${min} to ${max}`);
    }
  };
  doc.descendants((n) => {
    if (constructsOnly && !CONSTRUCT_NODES.has(n.type.name)) return true;
    const a = n.attrs;
    const block = a.attributes as BlockAttributes | undefined;
    if (block && n.type.name !== "directive" && n.type.name !== "separator") {
      identity({ attrs: { id: block.id, classes: block.classes } } as unknown as PMNode, n.type.name);
      for (const key of Object.keys(block.attrs))
        if (!IDENTIFIER.test(key)) found.push(`${n.type.name}: key "${key}" is not an identifier`);
    }
    switch (n.type.name) {
      case "card":
        identity(n, "card");
        oneOf(a.tone, ALLOWED.tone, "card tone");
        oneOf(a.compact, [true, false], "card compact");
        break;
      case "grid":
        identity(n, "grid");
        integer(a.cols, 1, 4, "grid cols");
        oneOf(a.gap, ALLOWED.gap, "grid gap");
        break;
      case "columns":
        identity(n, "columns");
        oneOf(a.gap, ALLOWED.gap, "columns gap");
        if (
          a.ratio !== null &&
          !(Array.isArray(a.ratio) && a.ratio.every((term: unknown) => Number.isInteger(term) && (term as number) > 0))
        ) {
          found.push(`columns ratio: ${JSON.stringify(a.ratio)} is not a list of positive integers`);
        }
        break;
      case "column":
        identity(n, "column");
        break;
      case "tabs":
        identity(n, "tabs");
        integer(a.active, 1, Math.max(1, n.childCount), "tabs active");
        break;
      case "tab":
        integer(a.depth, 1, 6, "tab depth");
        break;
      case "steps":
        identity(n, "steps");
        break;
      case "metrics": {
        identity(n, "metrics");
        oneOf(a.direction, ALLOWED.direction, "metrics direction");
        const header = n.firstChild?.firstChild;
        if ((header?.childCount ?? 0) < 2) found.push("metrics: the table needs at least two columns");
        break;
      }
      case "figure":
        identity(n, "figure");
        oneOf(a.chart, ALLOWED.chart, "figure chart");
        if (a.width !== null) integer(a.width, 1, 100, "figure width");
        break;
      case "callout":
        oneOf(a.kind, ALLOWED.kind, "callout kind");
        oneOf(a.fold, ALLOWED.fold, "callout fold");
        break;
      case "heading":
        integer(a.level, 1, 6, "heading level");
        break;
    }
    return true;
  });
  return found;
}

/** Changes that make `doc` expressible again, as one transaction step list. Returns null when nothing needs fixing. */
function normalize(tr: Transaction, tableNode: string): Transaction | null {
  let changed = false;
  tr.doc.descendants((n, pos) => {
    const set = (attrs: Record<string, unknown>) => {
      tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...n.attrs, ...attrs });
      changed = true;
    };
    switch (n.type.name) {
      case "columns": {
        // A ratio names one term per column (§4.4); when the columns change, it no longer says anything.
        const ratio = n.attrs.ratio as number[] | null;
        if (ratio && ratio.length !== n.childCount) set({ ratio: null });
        // The first column has no `::col` line to carry an id or classes.
        const first = n.firstChild;
        if (first && (first.attrs.id !== null || first.attrs.classes.length > 0)) {
          tr.setNodeMarkup(tr.mapping.map(pos + 1), undefined, { ...first.attrs, id: null, classes: [] });
          changed = true;
        }
        break;
      }
      case "tabs": {
        if (n.attrs.active > n.childCount) set({ active: n.childCount });
        const depth = n.firstChild?.attrs.depth ?? 3;
        n.forEach((tab, offset) => {
          const tabPos = pos + 1 + offset;
          if (tab.attrs.depth !== depth) {
            tr.setNodeMarkup(tr.mapping.map(tabPos), undefined, { ...tab.attrs, depth });
            changed = true;
          }
          // A heading at the tab's level or above is a new tab, or a mixed-level error (§4.5).
          tab.forEach((child, childOffset) => {
            if (child.type.name !== "heading" || child.attrs.level > depth) return;
            const at = tr.mapping.map(tabPos + 1 + childOffset);
            if (depth < 6) tr.setNodeMarkup(at, undefined, { ...child.attrs, level: depth + 1 });
            else tr.setNodeMarkup(at, tr.doc.type.schema.nodes.paragraph, { attributes: child.attrs.attributes });
            changed = true;
          });
        });
        break;
      }
      case "figure":
        // A chart is drawn from a table (§11); on anything else the attribute is an error.
        if (n.attrs.chart !== null && n.lastChild?.type.name !== tableNode) set({ chart: null });
        break;
      case "calloutTitle":
      case "cardTitle":
      case "tabLabel":
      case "figureCaption":
      case "directiveArgument":
        // Titles live on one line (§2.3, §4.1). A host whose titles take `inline*` can put a hard break in one.
        n.descendants((child, childPos) => {
          const at = tr.mapping.map(pos + 1 + childPos);
          if (child.isText && child.text?.includes("\n")) {
            tr.insertText(child.text.replace(/\r?\n/g, " "), at, at + child.nodeSize);
            changed = true;
          } else if (child.type.name === "hardBreak") {
            tr.insertText(" ", at, at + child.nodeSize);
            changed = true;
          }
        });
        break;
    }
    return true;
  });
  return changed ? tr : null;
}

const guardKey = new PluginKey("markset-guards");

function guards(count: (doc: PMNode) => string[], skip: (tr: Transaction) => boolean, tableNode: string) {
  return Extension.create({
    name: "marksetGuards",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: guardKey,
          // Refuse an edit that adds something no source can say. A document
          // loaded with problems can still be edited; it just cannot gain more.
          // A transaction the host says to skip is never refused: refusing a
          // collaborator's change would leave this editor out of step.
          filterTransaction: (tr, state) =>
            !tr.docChanged || skip(tr) || count(tr.doc).length <= count(state.doc).length,
          // Normalize after this editor's own changes only. Every collaborator
          // normalizing a change that arrived from another would apply the same
          // fix once per editor: a title's newline replaced by a space twice.
          appendTransaction: (transactions, _old, state) => {
            if (!transactions.some((tr) => tr.docChanged && !skip(tr))) return null;
            return normalize(state.tr, tableNode);
          },
        }),
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// Enter in a title

export const TITLES = new Set(["calloutTitle", "cardTitle", "tabLabel", "figureCaption", "directiveArgument"]);

/**
 * A title is one line (§2.3), so Enter leaves it for the construct's body,
 * making a first paragraph there if the body is empty. False outside a title.
 */
export function enterInTitle(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (!TITLES.has($from.parent.type.name)) return false;
  const after = $from.after();
  const tr = state.tr;
  const next = tr.doc.resolve(after).nodeAfter;
  if (!next) {
    const paragraph = state.schema.nodes.paragraph.create();
    if (!$from.node(-1).canReplaceWith($from.index(-1) + 1, $from.index(-1) + 1, paragraph.type)) return true;
    tr.insert(after, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  } else {
    tr.setSelection(Selection.near(tr.doc.resolve(after + 1)));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

const TitleKeys = Extension.create({
  name: "marksetTitleKeys",
  // Ahead of the host's own Enter, which would split a title into two titles.
  priority: 1000,
  addKeyboardShortcuts() {
    return { Enter: () => enterInTitle(this.editor) };
  },
});

// ---------------------------------------------------------------------------
// The extension

export interface MarksetConstructsOptions {
  /**
   * What a title, label or caption holds. The kit's `titleInline*` is inline
   * content without a hard break, a group a host's schema does not have; a
   * host passes `"inline*"`, and a hard break typed into a title is written as
   * a space.
   */
  titleContent: string;
  /** What a grid holds: one list. `"list"` is the group StarterKit's and the task lists' nodes are in. */
  listContent: string;
  /** The host's table node, which metrics hold and a figure may: `"table"` for TableKit, as in the kit. */
  tableNode: string;
  /** The node a figure shows an image with: the kit's `figureImage` (the default), or a host's block image, such as `"image"`. */
  imageNode: string;
  /** A figure's content. By default a caption and one of `imageNode`, `tableNode` or `codeBlock`. */
  figureContent: string | null;
  /** Node views by node name, replacing the default rendering of a construct. */
  nodeViews: Partial<Record<NodeName, NodeViewRenderer>>;
  /**
   * A transaction the guards leave alone: neither refused nor normalized. For
   * a collaborative editor, the ones that arrived from another editor, which
   * normalized them already: with y-tiptap (`@tiptap/extension-collaboration`)
   * that is `(tr) => tr.getMeta("y-sync$")?.isChangeOrigin === true`, the meta
   * `ySyncPluginKey` sets on every change it applies from the shared document.
   */
  skipNormalize: (tr: Transaction) => boolean;
  /**
   * The host's conversion settings, as given to `mdastToJSON`: `insertConstruct`
   * reads each construct's template through them, so a metrics table arrives
   * with TableKit's header cells and paragraphs.
   */
  host: ConvertHost;
  /** What the guards count. `constructProblems` by default; the kit counts the whole document's `problems`. */
  problems: (doc: PMNode) => string[];
}

export const MarksetConstructs = Extension.create<MarksetConstructsOptions>({
  name: "marksetConstructs",
  addOptions: () => ({
    titleContent: "titleInline*",
    listContent: "list",
    tableNode: "table",
    imageNode: "figureImage",
    figureContent: null,
    nodeViews: {},
    skipNormalize: () => false,
    host: {},
    problems: constructProblems,
  }),
  addExtensions() {
    const { titleContent, listContent, tableNode, imageNode, nodeViews, skipNormalize, host } = this.options;
    const count = this.options.problems;
    const figureContent = this.options.figureContent ?? `figureCaption? (${imageNode} | ${tableNode} | codeBlock)`;
    const nodes = constructNodes({ titleContent, listContent, tableNode, imageNode, figureContent }).map(
      (extension) => {
        const view = nodeViews[extension.name as NodeName];
        return view ? extension.configure({ nodeView: view }) : extension;
      },
    );
    const commands = Extension.create({
      name: "marksetConstructCommands",
      addCommands() {
        return {
          insertConstruct:
            (name) =>
            ({ commands }) =>
              commands.insertContent(constructFor(name, host)),
          setConstructAttributes:
            (attributes, name) =>
            ({ state, tr, dispatch }) => {
              const found = innermost(state, (n) => (name ? n.type.name === name : CONSTRUCT_NAMES.has(n.type.name)));
              if (!found) return false;
              const known = NODE_ATTRIBUTES[found.node.type.name as NodeName] as Record<string, unknown>;
              if (Object.keys(attributes).some((key) => !(key in known))) return false;
              tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attributes });
              if (count(tr.doc).length > count(state.doc).length) return false;
              dispatch?.(tr);
              return true;
            },
          removeConstruct:
            (name) =>
            ({ state, tr, dispatch }) => {
              const found = innermost(state, (n) => (name ? n.type.name === name : CONSTRUCT_NAMES.has(n.type.name)));
              if (!found) return false;
              dispatch?.(tr.delete(found.pos, found.pos + found.node.nodeSize));
              return true;
            },
        };
      },
    });
    return [...nodes, commands, TitleKeys, guards(count, skipNormalize, tableNode)] as AnyExtension[];
  },
});
