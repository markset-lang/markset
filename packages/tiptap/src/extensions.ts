/**
 * The TipTap kit: a schema that holds exactly what Markset can express, in
 * place of StarterKit. It is `MarksetConstructs` (constructs.ts) plus the
 * CommonMark nodes and marks, drawn as the renderer draws them (`ms-` classes,
 * `data-` variants) so `markset.css` or a host's theme styles the editor, the
 * commands for attribute lines and spans, StarterKit's keys, undo, and the
 * parser's diagnostics shown on their blocks.
 *
 * The kit's guards count the whole document's problems, so it also refuses a
 * heading level or an attribute line no source can say.
 */
import { Extension, Mark, Node, type AnyExtension, type NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode, DOMOutputSpec } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diagnose, fromMarkset, type EditorDiagnostic } from "./convert.ts";
import { ATTRS, MarksetConstructs, attributeSpec, blockHtml, innermost, node, problems } from "./constructs.ts";
import {
  MARK_ATTRIBUTES,
  TEMPLATES,
  type BlockAttributes,
  type ConstructName,
  type JSONNode,
  type MarkName,
  type NodeName,
} from "./model.ts";

export { constructProblems, elementFor, problems } from "./constructs.ts";

// ---------------------------------------------------------------------------
// The CommonMark nodes

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

export { TEMPLATES };

/** The construct's JSON, ready for `insertContent`. */
export function construct(name: ConstructName): JSONNode {
  return fromMarkset(TEMPLATES[name]).doc.content![0];
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markset: {
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
// Keys. The kit replaces StarterKit, so it brings the keys StarterKit would
// have. Enter in a title is MarksetConstructs', which runs first.

const HARD_BREAK_IN = new Set(["paragraph", "heading", "tableCell"]);

const Keys = Extension.create({
  name: "marksetKeys",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleMark("bold"),
      "Mod-i": () => this.editor.commands.toggleMark("italic"),
      "Mod-e": () => this.editor.commands.toggleMark("code"),
      "Shift-Enter": () =>
        HARD_BREAK_IN.has(this.editor.state.selection.$from.parent.type.name) &&
        this.editor.commands.insertContent({ type: "hardBreak" }),
      Enter: () => this.editor.commands.splitListItem("listItem"),
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

// ---------------------------------------------------------------------------
// The kit

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
  /** A transaction the guards leave alone, as in `MarksetConstructs`: a collaborator's change, under Yjs. */
  skipNormalize: (tr: Transaction) => boolean;
}

const Commands = Extension.create({
  name: "marksetCommands",
  addCommands() {
    return {
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
  addOptions: () => ({ nodeViews: {}, undoRedo: true, skipNormalize: () => false }),
  addExtensions() {
    const views = this.options.nodeViews;
    const withViews = nodes.map((extension) => {
      const view = views[extension.name as NodeName];
      return view ? extension.configure({ nodeView: view }) : extension;
    });
    const constructs = MarksetConstructs.configure({
      nodeViews: views,
      skipNormalize: this.options.skipNormalize,
      problems,
    });
    const extras = this.options.undoRedo ? [UndoRedo] : [];
    return [...withViews, ...marks, constructs, Commands, Keys, ...extras, Diagnostics] as AnyExtension[];
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
