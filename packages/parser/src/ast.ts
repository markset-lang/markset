import type { BlockContent, DefinitionContent, List, Node, Parent, PhrasingContent, Table } from "mdast";
import type { Attributes } from "./attributes.ts";

/**
 * Generic block directive as parsed (spec §2.3), before construct
 * normalization turns it into a `card`, `grid`, and so on. `name` is null only
 * when the fence line was malformed. `argument` holds the bracketed argument
 * parsed as inline content, or null when none was written.
 */
export interface Directive extends Parent {
  type: "directive";
  name: string | null;
  argument: PhrasingContent[] | null;
  attributes: Attributes;
  children: Array<BlockContent | DefinitionContent>;
}

/** Separator directive line (spec §2.4). */
export interface SeparatorNode extends Node {
  type: "separator";
  name: string;
  attributes: Attributes;
}

/** Attribute line (spec §2.5) as parsed; removed from the tree once attached to its block. */
export interface AttributeLine extends Node {
  type: "attributeLine";
  attributes: Attributes;
}

/** Bracketed span (spec §2.2). */
export interface Span extends Parent {
  type: "span";
  attributes: Attributes;
  children: PhrasingContent[];
}

declare module "mdast" {
  interface Root {
    /** Parsed §6 frontmatter. Present only when the document has a frontmatter block. */
    frontmatter?: import("./frontmatter.ts").Frontmatter;
  }
  interface BlockContentMap {
    directive: Directive;
    separator: SeparatorNode;
    attributeLine: AttributeLine;
  }
  interface RootContentMap {
    directive: Directive;
    separator: SeparatorNode;
    attributeLine: AttributeLine;
    span: Span;
  }
  /** Blocks an attribute line (§2.5) may attach to gain an `attributes` field. */
  interface Paragraph {
    attributes?: Attributes;
  }
  interface Heading {
    attributes?: Attributes;
  }
  interface List {
    attributes?: Attributes;
  }
  /** A list item gains `attributes` from attribute lines that open it (§2.5). */
  interface ListItem {
    attributes?: Attributes;
  }
  interface Table {
    attributes?: Attributes;
  }
  interface Code {
    attributes?: Attributes;
  }
  interface Blockquote {
    attributes?: Attributes;
  }
  interface ThematicBreak {
    attributes?: Attributes;
  }
  interface Html {
    attributes?: Attributes;
  }
  interface PhrasingContentMap {
    span: Span;
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    marksetDirective: "marksetDirective";
    marksetDirectiveFence: "marksetDirectiveFence";
    marksetDirectiveFenceSequence: "marksetDirectiveFenceSequence";
    marksetDirectiveName: "marksetDirectiveName";
    marksetDirectiveArgument: "marksetDirectiveArgument";
    marksetDirectiveArgumentMarker: "marksetDirectiveArgumentMarker";
    marksetDirectiveFenceRest: "marksetDirectiveFenceRest";
    marksetDirectiveContent: "marksetDirectiveContent";
    marksetDirectiveClosingFence: "marksetDirectiveClosingFence";
    marksetSeparator: "marksetSeparator";
    marksetSeparatorSequence: "marksetSeparatorSequence";
    marksetSeparatorRest: "marksetSeparatorRest";
    marksetSpan: "marksetSpan";
    marksetSpanMarker: "marksetSpanMarker";
    marksetSpanAttributes: "marksetSpanAttributes";
    marksetAttributeLine: "marksetAttributeLine";
  }
}

// ---------------------------------------------------------------------------
// Normalized constructs (spec §4)
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";
export type Gap = "sm" | "md" | "lg";
export type CalloutKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

/** Fields every directive-based construct carries from its attribute specifier. */
export interface ConstructBase extends Parent {
  id: string | null;
  classes: string[];
}

export interface Callout extends Parent {
  type: "callout";
  /** Present when an attribute line (§2.5) preceded the blockquote. */
  attributes?: Attributes;
  kind: CalloutKind;
  title: PhrasingContent[] | null;
  /** `-` after the marker is "closed", `+` is "open", absent is null. */
  fold: "closed" | "open" | null;
  children: Array<BlockContent | DefinitionContent>;
}

export interface Card extends ConstructBase {
  type: "card";
  title: PhrasingContent[] | null;
  tone: Tone;
  compact: boolean;
  children: Array<BlockContent | DefinitionContent>;
}

export interface Grid extends ConstructBase {
  type: "grid";
  cols: number;
  gap: Gap;
  /** Exactly one list. */
  children: [List];
}

export interface Columns extends ConstructBase {
  type: "columns";
  ratio: number[] | null;
  gap: Gap;
  children: Column[];
}

export interface Column extends ConstructBase {
  type: "column";
  children: Array<BlockContent | DefinitionContent>;
}

export interface Tabs extends ConstructBase {
  type: "tabs";
  /** 1-based index of the initially active tab. */
  active: number;
  children: Tab[];
}

export interface Tab extends Parent {
  type: "tab";
  /** Present when an attribute line (§2.5) preceded the tab's heading. */
  attributes?: Attributes;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  label: PhrasingContent[];
  children: Array<BlockContent | DefinitionContent>;
}

export interface Steps extends ConstructBase {
  type: "steps";
  /** Exactly one ordered list. */
  children: [List];
}

export interface Metrics extends ConstructBase {
  type: "metrics";
  direction: "normal" | "inverse";
  /** Exactly one table. */
  children: [Table];
}

export interface Figure extends ConstructBase {
  type: "figure";
  caption: PhrasingContent[] | null;
  /** Percentage, 1-100, or null. */
  width: number | null;
  children: Array<BlockContent | DefinitionContent>;
}

export type Construct = Callout | Card | Grid | Columns | Tabs | Steps | Metrics | Figure;

declare module "mdast" {
  interface BlockContentMap {
    callout: Callout;
    card: Card;
    grid: Grid;
    columns: Columns;
    column: Column;
    tabs: Tabs;
    tab: Tab;
    steps: Steps;
    metrics: Metrics;
    figure: Figure;
  }
  interface RootContentMap {
    callout: Callout;
    card: Card;
    grid: Grid;
    columns: Columns;
    column: Column;
    tabs: Tabs;
    tab: Tab;
    steps: Steps;
    metrics: Metrics;
    figure: Figure;
  }
}
