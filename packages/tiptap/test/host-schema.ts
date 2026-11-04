/**
 * Streamlane's body editor schema, for the tests: StarterKit with `undoRedo:
 * false`, TableKit, TaskList and TaskItem (nested), and a block `image`, each
 * node and mark with the name, group, content expression and attributes
 * TipTap 3.31 gives it. They are written out here rather than installed, so the
 * package's tests need no TipTap extension beyond `@tiptap/core`; the specs
 * were read from those packages' sources, and a change there is a change to
 * make here.
 *
 * `MARKSET_IN_HOST` is MarksetConstructs configured as such a host would
 * configure it, and `HOST` the conversion settings to read and write its JSON:
 * Streamlane's, from host.ts, plus what this schema has no node for, which it
 * drops (frontmatter, raw HTML, definitions, spans, link and image references).
 */
import { Mark, Node, type AnyExtension } from "@tiptap/core";
import { MarksetConstructs } from "../src/constructs.ts";
import type { ConvertHost } from "../src/convert.ts";
import { STREAMLANE } from "./host.ts";

const attribute = (value: unknown) => ({ default: value });

export const STARTER_KIT_AND_TABLE_KIT: AnyExtension[] = [
  Node.create({ name: "doc", topNode: true, content: "block+" }),
  Node.create({
    name: "paragraph",
    group: "block",
    content: "inline*",
    parseHTML: () => [{ tag: "p" }],
    renderHTML: () => ["p", 0],
  }),
  Node.create({ name: "text", group: "inline" }),
  Node.create({
    name: "heading",
    group: "block",
    content: "inline*",
    defining: true,
    addAttributes: () => ({ level: attribute(1) }),
    renderHTML: ({ node }) => [`h${node.attrs.level}`, 0],
  }),
  Node.create({
    name: "blockquote",
    group: "block",
    content: "block+",
    defining: true,
    renderHTML: () => ["blockquote", 0],
  }),
  Node.create({ name: "bulletList", group: "block list", content: "listItem+", renderHTML: () => ["ul", 0] }),
  Node.create({
    name: "orderedList",
    group: "block list",
    content: "listItem+",
    addAttributes: () => ({ start: attribute(1), type: attribute(null) }),
    renderHTML: () => ["ol", 0],
  }),
  Node.create({ name: "listItem", content: "paragraph block*", defining: true, renderHTML: () => ["li", 0] }),
  Node.create({
    name: "codeBlock",
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    addAttributes: () => ({ language: attribute(null) }),
    renderHTML: () => ["pre", ["code", 0]],
  }),
  Node.create({ name: "horizontalRule", group: "block", renderHTML: () => ["hr"] }),
  Node.create({ name: "hardBreak", group: "inline", inline: true, selectable: false, renderHTML: () => ["br"] }),
  Mark.create({ name: "bold", renderHTML: () => ["strong", 0] }),
  Mark.create({ name: "italic", renderHTML: () => ["em", 0] }),
  Mark.create({ name: "strike", renderHTML: () => ["s", 0] }),
  Mark.create({ name: "underline", renderHTML: () => ["u", 0] }),
  Mark.create({ name: "code", excludes: "_", renderHTML: () => ["code", 0] }),
  Mark.create({
    name: "link",
    inclusive: false,
    addAttributes: () => ({
      href: attribute(null),
      target: attribute("_blank"),
      rel: attribute("noopener noreferrer nofollow"),
      class: attribute(null),
      title: attribute(null),
    }),
    renderHTML: ({ HTMLAttributes }) => ["a", HTMLAttributes, 0],
  }),
  Node.create({
    name: "table",
    group: "block",
    content: "tableRow+",
    isolating: true,
    renderHTML: () => ["table", ["tbody", 0]],
  }),
  Node.create({ name: "tableRow", content: "(tableCell | tableHeader)*", renderHTML: () => ["tr", 0] }),
  ...(["tableCell", "tableHeader"] as const).map((name) =>
    Node.create({
      name,
      content: "block+",
      isolating: true,
      addAttributes: () => ({ colspan: attribute(1), rowspan: attribute(1), colwidth: attribute(null) }),
      renderHTML: () => [name === "tableHeader" ? "th" : "td", 0],
    }),
  ),
  Node.create({ name: "taskList", group: "block list", content: "taskItem+", renderHTML: () => ["ul", 0] }),
  Node.create({
    name: "taskItem",
    content: "paragraph block*",
    defining: true,
    addAttributes: () => ({ checked: attribute(false) }),
    renderHTML: () => ["li", 0],
  }),
  Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes: () => ({ src: attribute(null), alt: attribute(null), title: attribute(null) }),
    renderHTML: ({ HTMLAttributes }) => ["img", HTMLAttributes],
  }),
];

/** Dropped on reading: what this schema has no node or mark for. */
const DROPPED_NODES = new Set(["yaml", "html", "definition", "imageReference"]);
const DROPPED_MARKS = new Set(["span", "linkReference"]);

export const HOST: ConvertHost = {
  ...STREAMLANE,
  node: {
    toJSON(node, context) {
      if (DROPPED_NODES.has(node.type)) return null;
      // An image among text has nowhere to go but its alternative text.
      if (node.type === "image") return node.alt ? { type: "text", text: node.alt } : null;
      // `[]{#anchor}`, a span with nothing in it, which no mark can hold.
      if ((node.type as string) === "span" && (node as { children: unknown[] }).children.length === 0) return null;
      return STREAMLANE.node?.toJSON?.(node, context);
    },
    toMdast: (node, context) => STREAMLANE.node?.toMdast?.(node, context),
  },
  mark: {
    toJSON: (node, context) => (DROPPED_MARKS.has(node.type) ? null : STREAMLANE.mark?.toJSON?.(node, context)),
    toMdast: (mark, context) => STREAMLANE.mark?.toMdast?.(mark, context),
  },
};

export const MARKSET_IN_HOST = MarksetConstructs.configure({
  titleContent: "inline*",
  imageNode: "image",
  host: HOST,
  skipNormalize: (tr) => tr.getMeta("y-sync$")?.isChangeOrigin === true,
});

export const HOST_EXTENSIONS: AnyExtension[] = [...STARTER_KIT_AND_TABLE_KIT, MARKSET_IN_HOST];
