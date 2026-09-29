/**
 * React node views for the Markset constructs, from an entry point of their
 * own so that a host without React never loads it.
 *
 * They are deliberately plain: each draws the same element, `ms-` classes and
 * `data-` attributes as the default rendering, so the same stylesheet applies,
 * and puts the construct's content inside. They exist to be replaced one at a
 * time — a host passes its own component for `card` and keeps the rest — and to
 * show the shape a replacement takes.
 */
import { createElement, type ComponentType } from "react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { NodeViewRenderer } from "@tiptap/core";
import { elementFor } from "./extensions.ts";
import type { NodeName } from "./model.ts";

/** The nodes that get a React view by default: the constructs and their parts. */
export const REACT_NODES = [
  "callout",
  "calloutTitle",
  "card",
  "cardTitle",
  "grid",
  "columns",
  "column",
  "tabs",
  "tab",
  "tabLabel",
  "steps",
  "metrics",
  "figure",
  "figureCaption",
] as const satisfies readonly NodeName[];

/** HTML attributes as React props: `class` to `className`, a `style` string to an object. */
export function reactProps(attributes: Record<string, string>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") props.className = value;
    else if (name === "contenteditable") props.contentEditable = value === "true";
    else if (name === "style") {
      props.style = Object.fromEntries(
        value
          .split(";")
          .map((rule) => rule.split(":").map((part) => part.trim()))
          .filter(([property, v]) => property && v !== undefined)
          .map(([property, ...rest]) => [property, rest.join(":")]),
      );
    } else props[name] = value;
  }
  return props;
}

/** Draws a construct as its default element, with its content inside. The component a replacement stands in for. */
export function ConstructView({ node }: ReactNodeViewProps) {
  const { tag, attributes } = elementFor(node);
  return createElement(
    NodeViewWrapper,
    { as: tag as "div", ...reactProps(attributes) },
    createElement(NodeViewContent),
  );
}

/** Node views for the kit's `nodeViews` option: the default component for every construct, or `overrides` where given. */
export function reactNodeViews(
  overrides: Partial<Record<NodeName, ComponentType<ReactNodeViewProps>>> = {},
): Partial<Record<NodeName, NodeViewRenderer>> {
  const views: Partial<Record<NodeName, NodeViewRenderer>> = {};
  for (const name of REACT_NODES) views[name] = ReactNodeViewRenderer(overrides[name] ?? ConstructView);
  for (const [name, component] of Object.entries(overrides)) {
    if (component) views[name as NodeName] = ReactNodeViewRenderer(component);
  }
  return views;
}
