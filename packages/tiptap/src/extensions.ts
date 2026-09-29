/**
 * The TipTap extension set: a schema that holds exactly what Markset can
 * express, HTML for each node in the renderer's conventions (`ms-` classes,
 * `data-` variants) so `markset.css` or a host's theme styles the editor, the
 * commands that insert, change and remove constructs, and the guards that stop
 * an edit from producing a document the parser would reject.
 *
 * The schema carries most of §4 by itself: a grid holds exactly one list, steps
 * one ordered list, metrics one table, a figure one image, table or code block.
 * What a content expression cannot say — a metrics table's column count, a
 * columns ratio matching its columns, tab headings at one level — the guards
 * at the end of this file enforce.
 */
import { Extension, Mark, Node, type AnyExtension, type NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode, DOMOutputSpec } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diagnose, fromMarkset, type EditorDiagnostic } from "./convert.ts";
import {
  ALLOWED,
  MARK_ATTRIBUTES,
  NODE_ATTRIBUTES,
  type BlockAttributes,
  type ConstructName,
  type JSONNode,
  type MarkName,
  type NodeName,
} from "./model.ts";

// ---------------------------------------------------------------------------
// Attributes round-trip through the DOM as one JSON attribute. ProseMirror's
// clipboard serializes a copied slice with renderHTML and reads it back with
// parseHTML, so this is what keeps a pasted card a card with its tone.

const ATTRS = "data-ms-attrs";

function attributeSpec(defaults: Record<string, unknown>) {
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
function blockHtml(attributes: BlockAttributes, first?: string): Record<string, string> {
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

interface NodeOptions {
  /** Replaces the node's rendering in the editor. Set through the kit's `nodeViews`. */
  nodeView: NodeViewRenderer | null;
}

function node(
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

const blockAttrs = (node: PMNode, first?: string) => ({
  "data-ms": node.type.name,
  [ATTRS]: JSON.stringify(node.attrs),
  ...blockHtml(node.attrs.attributes, first),
});

const HEADINGS = [1, 2, 3, 4, 5, 6];

const nodes = [
  Node.create({ name: "doc", topNode: true, content: "frontmatter? block*" }),
  Node.create({ name: "text", group: "inline titleInline" }),
  node("frontmatter", {
    atom: true,
    selectable: false,
    render: (n) => [
      "pre",
      { "data-ms": "frontmatter", [ATTRS]: JSON.stringify(n.attrs), contenteditable: "false", class: "ms-frontmatter" },
      n.attrs.value,
    ],
  }),
  node("paragraph", {
    group: "block",
    content: "inline*",
    whitespace: "pre",
    parse: [{ tag: "p" }],
    render: (n) => ["p", blockAttrs(n), 0],
  }),
  node("heading", {
    group: "block",
    content: "inline*",
    whitespace: "pre",
    defining: true,
    parse: HEADINGS.map((level) => ({ tag: `h${level}`, getAttrs: () => ({ level }) })),
    render: (n) => [`h${n.attrs.level}`, blockAttrs(n), 0],
  }),
  node("blockquote", {
    group: "block",
    content: "block*",
    defining: true,
    parse: [{ tag: "blockquote" }],
    render: (n) => ["blockquote", blockAttrs(n), 0],
  }),
  node("bulletList", {
    group: "block list",
    content: "listItem+",
    parse: [{ tag: "ul" }],
    render: (n) => ["ul", blockAttrs(n), 0],
  }),
  node("orderedList", {
    group: "block list",
    content: "listItem+",
    parse: [{ tag: "ol", getAttrs: (element) => ({ start: Number(element.getAttribute("start") ?? 1) }) }],
    render: (n) => ["ol", { ...blockAttrs(n), ...(n.attrs.start === 1 ? {} : { start: String(n.attrs.start) }) }, 0],
  }),
  node("listItem", {
    content: "block*",
    defining: true,
    parse: [{ tag: "li" }],
    render: (n) => ["li", blockAttrs(n), 0],
  }),
  node("codeBlock", {
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    whitespace: "pre",
    parse: [{ tag: "pre" }],
    render: (n) => [
      "pre",
      { "data-ms": "codeBlock", [ATTRS]: JSON.stringify(n.attrs) },
      ["code", { ...blockHtml(n.attrs.attributes, n.attrs.language ? `language-${n.attrs.language}` : undefined) }, 0],
    ],
  }),
  node("horizontalRule", { group: "block", atom: true, parse: [{ tag: "hr" }], render: (n) => ["hr", blockAttrs(n)] }),
  node("htmlBlock", {
    group: "block",
    atom: true,
    render: (n) => ["pre", { ...blockAttrs(n, "ms-html"), contenteditable: "false" }, n.attrs.value],
  }),
  node("definition", {
    group: "block",
    atom: true,
    render: (n) => [
      "div",
      { ...blockAttrs(n, "ms-definition"), contenteditable: "false" },
      `[${n.attrs.label ?? n.attrs.identifier}]: ${n.attrs.url}`,
    ],
  }),
  node("table", {
    group: "block",
    content: "tableRow+",
    isolating: true,
    parse: [{ tag: "table" }],
    render: (n) => ["table", blockAttrs(n), ["tbody", 0]],
  }),
  node("tableRow", { content: "tableCell+", parse: [{ tag: "tr" }], render: () => ["tr", 0] }),
  node("tableCell", {
    content: "inline*",
    whitespace: "pre",
    isolating: true,
    parse: [{ tag: "td" }, { tag: "th" }],
    render: (n) => ["td", { "data-ms": "tableCell", [ATTRS]: JSON.stringify(n.attrs) }, 0],
  }),
  node("hardBreak", { group: "inline", inline: true, selectable: false, parse: [{ tag: "br" }], render: () => ["br"] }),
  node("image", {
    group: "inline titleInline",
    inline: true,
    atom: true,
    draggable: true,
    parse: [
      {
        tag: "img[src]",
        getAttrs: (element) => ({
          src: element.getAttribute("src"),
          alt: element.getAttribute("alt"),
          title: element.getAttribute("title"),
        }),
      },
    ],
    render: (n) => [
      "img",
      {
        "data-ms": "image",
        [ATTRS]: JSON.stringify(n.attrs),
        src: n.attrs.src,
        ...(n.attrs.alt ? { alt: n.attrs.alt } : {}),
        ...(n.attrs.title ? { title: n.attrs.title } : {}),
      },
    ],
  }),
  node("imageReference", {
    group: "inline titleInline",
    inline: true,
    atom: true,
    render: (n) => [
      "span",
      { "data-ms": "imageReference", [ATTRS]: JSON.stringify(n.attrs), class: "ms-image-reference" },
      n.attrs.alt ?? n.attrs.identifier,
    ],
  }),
  node("htmlInline", {
    group: "inline titleInline",
    inline: true,
    atom: true,
    render: (n) => [
      "code",
      { "data-ms": "htmlInline", [ATTRS]: JSON.stringify(n.attrs), class: "ms-html" },
      n.attrs.value,
    ],
  }),
  node("emptySpan", {
    group: "inline titleInline",
    inline: true,
    atom: true,
    render: (n) => [
      "span",
      {
        "data-ms": "emptySpan",
        [ATTRS]: JSON.stringify(n.attrs),
        ...blockHtml({ id: n.attrs.id, classes: n.attrs.classes, attrs: n.attrs.attrs }, "ms-span"),
      },
    ],
  }),

  node("callout", { group: "block", content: "calloutTitle block*", defining: true }),
  node("calloutTitle", { content: "titleInline*", whitespace: "pre", defining: true }),
  node("card", { group: "block", content: "cardTitle? block*", defining: true }),
  node("cardTitle", { content: "titleInline*", whitespace: "pre", defining: true }),
  node("grid", { group: "block", content: "list", defining: true }),
  node("columns", { group: "block", content: "column+", defining: true }),
  node("column", { content: "block*", defining: true }),
  node("tabs", { group: "block", content: "tab+", defining: true }),
  node("tab", { content: "tabLabel block*", defining: true }),
  node("tabLabel", { content: "titleInline*", whitespace: "pre", defining: true }),
  node("steps", { group: "block", content: "orderedList", defining: true }),
  node("metrics", { group: "block", content: "table", defining: true }),
  node("figure", { group: "block", content: "figureCaption? (figureImage | table | codeBlock)", defining: true }),
  node("figureCaption", { content: "titleInline*", whitespace: "pre", defining: true }),
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
  node("directive", { group: "block", content: "directiveArgument? block*", defining: true }),
  node("directiveArgument", { content: "titleInline*", whitespace: "pre", defining: true }),
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

// ---------------------------------------------------------------------------
// Marks

function mark(
  name: MarkName,
  config: {
    excludes?: string;
    inclusive?: boolean;
    parse: Array<{ tag: string }>;
    render: (attrs: Record<string, unknown>) => DOMOutputSpec;
  },
) {
  const defaults = MARK_ATTRIBUTES[name] as Record<string, unknown>;
  return Mark.create({
    name,
    ...(config.excludes !== undefined ? { excludes: config.excludes } : {}),
    ...(config.inclusive !== undefined ? { inclusive: config.inclusive } : {}),
    addAttributes: () => attributeSpec(defaults),
    parseHTML: () => [
      { tag: `[data-ms="${name}"]`, priority: 100 },
      ...config.parse.map((rule) => ({ ...rule, priority: 50 })),
    ],
    renderHTML: ({ mark }) => config.render(mark.attrs),
  });
}

const markAttrs = (name: string, attrs: Record<string, unknown>) => ({
  "data-ms": name,
  [ATTRS]: JSON.stringify(attrs),
});

const marks = [
  mark("link", {
    inclusive: false,
    parse: [{ tag: "a[href]" }],
    render: (a) => [
      "a",
      { ...markAttrs("link", a), href: String(a.href), ...(a.title ? { title: String(a.title) } : {}) },
      0,
    ],
  }),
  mark("linkReference", {
    inclusive: false,
    parse: [],
    render: (a) => ["a", { ...markAttrs("linkReference", a), class: "ms-link-reference" }, 0],
  }),
  // Spans nest, `[a [b]{.y} c]{.x}`, so a span does not exclude another span.
  mark("span", {
    excludes: "",
    parse: [],
    render: (a) => [
      "span",
      {
        ...markAttrs("span", a),
        ...blockHtml(
          { id: a.id as string | null, classes: a.classes as string[], attrs: a.attrs as Record<string, string> },
          "ms-span",
        ),
      },
      0,
    ],
  }),
  mark("bold", { parse: [{ tag: "strong" }, { tag: "b" }], render: (a) => ["strong", markAttrs("bold", a), 0] }),
  mark("italic", { parse: [{ tag: "em" }, { tag: "i" }], render: (a) => ["em", markAttrs("italic", a), 0] }),
  // Code excludes nothing but itself: `**`x`**` is strong around inline code.
  mark("code", { parse: [{ tag: "code" }], render: (a) => ["code", markAttrs("code", a), 0] }),
];

// ---------------------------------------------------------------------------
// Commands

/** The canonical new instance of each construct: valid on its own, and small. */
export const TEMPLATES: Record<ConstructName, string> = {
  callout: "> [!NOTE]\n> Text.\n",
  card: ":::card[Title]\nText.\n:::\n",
  grid: ":::grid\n- One\n- Two\n:::\n",
  columns: "::::columns\nFirst column.\n\n::col\n\nSecond column.\n::::\n",
  tabs: ":::tabs\n### First\nText.\n\n### Second\nText.\n:::\n",
  steps: ":::steps\n1. First step.\n2. Second step.\n:::\n",
  metrics: ":::metrics\n| Metric | Value | Δ |\n|---|---|---|\n| Revenue | $1.0M | +5% |\n:::\n",
  figure: ":::figure[Caption]\n| Item | Value |\n|---|---|\n| A | 1 |\n:::\n",
};

/** The construct's JSON, ready for `insertContent`. */
export function construct(name: ConstructName): JSONNode {
  return fromMarkset(TEMPLATES[name]).doc.content![0];
}

const CONSTRUCT_NAMES = new Set<string>(["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"]);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markset: {
      /** Insert a new construct at the selection. */
      insertConstruct: (name: ConstructName) => ReturnType;
      /** Change the attributes of the innermost construct around the selection. Refused when a value is not one §4 allows. */
      setConstructAttributes: (attributes: Record<string, unknown>, name?: ConstructName) => ReturnType;
      /** Remove the innermost construct around the selection, or the innermost one named. */
      removeConstruct: (name?: ConstructName) => ReturnType;
      /** Give the innermost block around the selection §2.5 attributes, or clear them with null. */
      setBlockAttributes: (attributes: BlockAttributes) => ReturnType;
      /** Wrap the selected text in a bracketed span (§2.2). */
      setSpan: (attributes: { id?: string | null; classes?: string[]; attrs?: Record<string, string> }) => ReturnType;
      unsetSpan: () => ReturnType;
      /** Show these diagnostics on their blocks, replacing any shown before. */
      setDiagnostics: (diagnostics: EditorDiagnostic[]) => ReturnType;
    };
  }
}

function innermost(
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
function normalize(tr: Transaction): Transaction | null {
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
        if (n.attrs.chart !== null && n.lastChild?.type.name !== "table") set({ chart: null });
        break;
      case "calloutTitle":
      case "cardTitle":
      case "tabLabel":
      case "figureCaption":
      case "directiveArgument":
        // Titles live on one line (§2.3, §4.1).
        n.descendants((child, childPos) => {
          if (child.isText && child.text?.includes("\n")) {
            const at = tr.mapping.map(pos + 1 + childPos);
            tr.insertText(child.text.replace(/\r?\n/g, " "), at, at + child.nodeSize);
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

const Guards = Extension.create({
  name: "marksetGuards",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: guardKey,
        // Refuse an edit that adds something no source can say. A document
        // loaded with problems can still be edited; it just cannot gain more.
        filterTransaction: (tr, state) => !tr.docChanged || problems(tr.doc).length <= problems(state.doc).length,
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          return normalize(state.tr);
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Diagnostics

const diagnosticsKey = new PluginKey<DecorationSet>("markset-diagnostics");

function decorations(doc: PMNode, diagnostics: EditorDiagnostic[]): DecorationSet {
  const found: Decoration[] = [];
  for (const diagnostic of diagnostics) {
    let target: PMNode = doc;
    let pos = -1;
    for (const index of diagnostic.path) {
      if (index >= target.childCount) break;
      let offset = pos + 1;
      for (let i = 0; i < index; i++) offset += target.child(i).nodeSize;
      pos = offset;
      target = target.child(index);
    }
    if (pos < 0) continue;
    found.push(
      Decoration.node(pos, pos + target.nodeSize, {
        class: "ms-diagnostic",
        "data-severity": diagnostic.severity,
        "data-code": diagnostic.code,
        title: `${diagnostic.code}: ${diagnostic.message}`,
      }),
    );
  }
  return DecorationSet.create(doc, found);
}

const Diagnostics = Extension.create({
  name: "marksetDiagnostics",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: diagnosticsKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const replaced = tr.getMeta(diagnosticsKey) as EditorDiagnostic[] | undefined;
            return replaced ? decorations(tr.doc, replaced) : set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => diagnosticsKey.getState(state) },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// The kit

// ---------------------------------------------------------------------------
// Keys. The kit replaces StarterKit, so it brings the keys StarterKit would have.

const TITLES = new Set(["calloutTitle", "cardTitle", "tabLabel", "figureCaption", "directiveArgument"]);
const HARD_BREAK_IN = new Set(["paragraph", "heading", "tableCell"]);

const Keys = Extension.create({
  name: "marksetKeys",
  // Ahead of TipTap's own Enter, which would split a title into two titles.
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleMark("bold"),
      "Mod-i": () => this.editor.commands.toggleMark("italic"),
      "Mod-e": () => this.editor.commands.toggleMark("code"),
      "Shift-Enter": () =>
        HARD_BREAK_IN.has(this.editor.state.selection.$from.parent.type.name) &&
        this.editor.commands.insertContent({ type: "hardBreak" }),
      // A title is one line (§2.3), so Enter leaves it for the construct's body,
      // making a first paragraph there if the body is empty.
      Enter: () => {
        const { state, view } = this.editor;
        const { $from } = state.selection;
        if (!TITLES.has($from.parent.type.name)) return this.editor.commands.splitListItem("listItem");
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
      },
      Tab: () => this.editor.commands.sinkListItem("listItem"),
      "Shift-Tab": () => this.editor.commands.liftListItem("listItem"),
    };
  },
});

const UndoRedo = Extension.create({
  name: "marksetUndoRedo",
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    const run = (command: typeof undo) => () => command(this.editor.state, this.editor.view.dispatch);
    return { "Mod-z": run(undo), "Shift-Mod-z": run(redo), "Mod-y": run(redo) };
  },
});

export interface MarksetOptions {
  /**
   * Node views by node name, replacing the default rendering: a host supplies
   * its own card, tabs or callout. `@markset-lang/tiptap/react` has a set to start from.
   */
  nodeViews: Partial<Record<NodeName, NodeViewRenderer>>;
  /**
   * Undo and redo, on by default. Turn it off when the host brings its own, as
   * a Yjs editor does: two histories over one document undo each other's steps.
   */
  undoRedo: boolean;
}

const Commands = Extension.create({
  name: "marksetCommands",
  addCommands() {
    return {
      insertConstruct:
        (name) =>
        ({ commands }) =>
          commands.insertContent(construct(name)),
      setConstructAttributes:
        (attributes, name) =>
        ({ state, tr, dispatch }) => {
          const found = innermost(state, (n) => (name ? n.type.name === name : CONSTRUCT_NAMES.has(n.type.name)));
          if (!found) return false;
          const known = NODE_ATTRIBUTES[found.node.type.name as NodeName] as Record<string, unknown>;
          if (Object.keys(attributes).some((key) => !(key in known))) return false;
          tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attributes });
          if (problems(tr.doc).length > problems(state.doc).length) return false;
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
      setBlockAttributes:
        (attributes) =>
        ({ state, tr, dispatch }) => {
          const found = innermost(
            state,
            (n) => "attributes" in n.attrs && n.type.name !== "directive" && n.type.name !== "separator",
          );
          if (!found) return false;
          tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, attributes });
          if (problems(tr.doc).length > problems(state.doc).length) return false;
          dispatch?.(tr);
          return true;
        },
      setSpan:
        (attributes) =>
        ({ commands }) => {
          const attrs = { id: attributes.id ?? null, classes: attributes.classes ?? [], attrs: attributes.attrs ?? {} };
          const names = [...(attrs.id ? [attrs.id] : []), ...attrs.classes, ...Object.keys(attrs.attrs)];
          if (!names.every((value) => IDENTIFIER.test(value))) return false;
          return commands.setMark("span", attrs);
        },
      unsetSpan:
        () =>
        ({ commands }) =>
          commands.unsetMark("span"),
      setDiagnostics:
        (diagnostics) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(diagnosticsKey, diagnostics).setMeta("addToHistory", false));
          return true;
        },
    };
  },
});

export const Markset = Extension.create<MarksetOptions>({
  name: "markset",
  addOptions: () => ({ nodeViews: {}, undoRedo: true }),
  addExtensions() {
    const views = this.options.nodeViews;
    const withViews = nodes.map((extension) => {
      const view = views[extension.name as NodeName];
      return view ? extension.configure({ nodeView: view }) : extension;
    });
    const extras = this.options.undoRedo ? [UndoRedo] : [];
    return [...withViews, ...marks, Commands, Keys, ...extras, Guards, Diagnostics] as AnyExtension[];
  },
});

/** Check the editor's document against the parser, and show what it reports on the blocks it is about. */
export function refreshDiagnostics(
  editor: { getJSON: () => unknown; commands: { setDiagnostics: (d: EditorDiagnostic[]) => boolean } },
  original?: string,
): EditorDiagnostic[] {
  const found = diagnose(editor.getJSON() as JSONNode, original);
  editor.commands.setDiagnostics(found);
  return found;
}
