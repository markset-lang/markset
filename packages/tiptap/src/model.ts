/**
 * The ProseMirror side of the Markset tree: every node and mark the editor
 * has, and the attributes each carries with its default. The TipTap schema in
 * extensions.ts and the conversion in convert.ts both read this table, so the
 * JSON one produces is the JSON the other expects.
 *
 * CommonMark nodes use TipTap's usual names (`paragraph`, `bulletList`,
 * `bold`) so a host's toolbar commands keep working; the Markset constructs
 * use their §4 names. Attributes mirror the mdast fields one to one, because
 * anything the editor dropped would be a change to the file.
 */
import type { Attributes } from "@markset-lang/parser";

/** The §2.5 attributes a block carries from an attribute line, or null. */
export type BlockAttributes = Pick<Attributes, "id" | "classes" | "attrs"> | null;

export interface JSONNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  marks?: JSONMark[];
  text?: string;
}

export interface JSONMark {
  type: string;
  attrs?: Record<string, unknown>;
}

const attributes = { attributes: null as BlockAttributes };
const identity = { id: null as string | null, classes: [] as string[] };

/** Node name -> attribute defaults. Every attribute a node has is listed, including those whose default is null. */
export const NODE_ATTRIBUTES = {
  doc: {},
  text: {},
  frontmatter: { value: "" },
  paragraph: { ...attributes },
  heading: { level: 1, ...attributes },
  blockquote: { ...attributes },
  bulletList: { spread: false, ...attributes },
  orderedList: { start: 1, spread: false, ...attributes },
  listItem: { spread: false, checked: null as boolean | null, ...attributes },
  codeBlock: { language: null as string | null, meta: null as string | null, ...attributes },
  horizontalRule: { ...attributes },
  htmlBlock: { value: "", ...attributes },
  definition: { identifier: "", label: null as string | null, url: "", title: null as string | null },
  table: { align: [] as Array<"left" | "right" | "center" | null>, ...attributes },
  tableRow: {},
  tableCell: {},
  hardBreak: {},
  image: { src: "", alt: null as string | null, title: null as string | null },
  imageReference: { identifier: "", label: null as string | null, referenceType: "full", alt: null as string | null },
  htmlInline: { value: "" },
  /** A span with nothing in it, `[]{#anchor}`, which a mark cannot hold. */
  emptySpan: { ...identity, attrs: {} as Record<string, string> },

  callout: { kind: "NOTE", fold: null as "open" | "closed" | null, ...attributes },
  calloutTitle: {},
  card: { tone: "neutral", compact: false, ...identity },
  cardTitle: {},
  grid: { cols: 2, gap: "md", ...identity },
  columns: { ratio: null as number[] | null, gap: "md", ...identity },
  column: { ...identity },
  tabs: { active: 1, ...identity },
  tab: { depth: 3, ...attributes },
  tabLabel: {},
  steps: { ...identity },
  metrics: { direction: "normal", ...identity },
  figure: { width: null as number | null, chart: null as string | null, ...identity },
  figureCaption: {},
  figureImage: { src: "", alt: null as string | null, title: null as string | null },

  /** A directive whose content failed validation, kept so nothing is lost; the diagnostics say why. */
  directive: {
    name: null as string | null,
    attributes: { id: null, classes: [], attrs: {} } as NonNullable<BlockAttributes>,
  },
  directiveArgument: {},
  /** A `::col` outside `columns`, which is an error, kept for the same reason. */
  separator: { name: "col", attributes: { id: null, classes: [], attrs: {} } as NonNullable<BlockAttributes> },
} as const;

export type NodeName = keyof typeof NODE_ATTRIBUTES;

export const MARK_ATTRIBUTES = {
  link: { href: "", title: null as string | null },
  linkReference: { identifier: "", label: null as string | null, referenceType: "full" },
  span: { ...identity, attrs: {} as Record<string, string> },
  bold: {},
  italic: {},
  code: {},
} as const;

export type MarkName = keyof typeof MARK_ATTRIBUTES;

/** Outermost first: the nesting a changed paragraph's marks are written back in. `code` is always innermost. */
export const MARK_ORDER: readonly MarkName[] = ["link", "linkReference", "span", "bold", "italic", "code"];

/** The §4 constructs, by the name an author writes. */
export const CONSTRUCTS = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const;
export type ConstructName = (typeof CONSTRUCTS)[number];

/** Values each construct attribute accepts (§4). An editor command that sets anything else is refused. */
export const ALLOWED = {
  tone: ["neutral", "info", "success", "warn", "danger"],
  gap: ["sm", "md", "lg"],
  kind: ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"],
  fold: [null, "open", "closed"],
  direction: ["normal", "inverse"],
  chart: [null, "line", "bar", "column"],
} as const;

/** Fill every attribute a node or mark has, so two JSON documents compare equal whatever omitted a default. */
export function withDefaults(json: JSONNode): JSONNode {
  const defaults = (NODE_ATTRIBUTES as Record<string, Record<string, unknown>>)[json.type];
  const out: JSONNode = { type: json.type };
  if (defaults && Object.keys(defaults).length > 0) out.attrs = { ...structuredClone(defaults), ...json.attrs };
  if (json.text !== undefined) out.text = json.text;
  if (json.marks && json.marks.length > 0) {
    out.marks = json.marks
      .map((mark) => {
        const markDefaults = (MARK_ATTRIBUTES as Record<string, Record<string, unknown>>)[mark.type] ?? {};
        return Object.keys(markDefaults).length > 0
          ? { type: mark.type, attrs: { ...structuredClone(markDefaults), ...mark.attrs } }
          : { type: mark.type };
      })
      // Stable, so two spans keep the order ProseMirror holds them in, which is outermost first.
      .sort((a, b) => markRank(a.type) - markRank(b.type));
  }
  if (json.content && json.content.length > 0) out.content = json.content.map(withDefaults);
  return out;
}

export function markRank(type: string): number {
  const index = MARK_ORDER.indexOf(type as MarkName);
  return index === -1 ? MARK_ORDER.length : index;
}
