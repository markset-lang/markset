import type { BlockContent, DefinitionContent, Node, Parent, PhrasingContent } from "mdast";
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

/** Bracketed span (spec §2.2). */
export interface Span extends Parent {
  type: "span";
  attributes: Attributes;
  children: PhrasingContent[];
}

declare module "mdast" {
  interface BlockContentMap {
    directive: Directive;
    separator: SeparatorNode;
  }
  interface RootContentMap {
    directive: Directive;
    separator: SeparatorNode;
    span: Span;
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
  }
}
