/**
 * Construct normalization (spec §4): turns generic `directive` nodes and
 * alert-style blockquotes into typed construct nodes, validating content
 * shape and attributes. Runs bottom-up so nested constructs are already
 * normalized when their parent is examined.
 *
 * A directive whose content fails validation stays a generic `directive`
 * node so nothing is lost; attribute problems are reported and the default
 * value is used.
 */
import type { Blockquote, Heading, Nodes, Paragraph, PhrasingContent, Root, RootContent, Text } from "mdast";
import { CHART_TYPES } from "./ast.ts";
import type {
  Callout,
  CalloutKind,
  Card,
  ChartType,
  Column,
  Columns,
  Directive,
  Figure,
  Gap,
  Grid,
  Metrics,
  SeparatorNode,
  Steps,
  Tab,
  Tabs,
  Tone,
} from "./ast.ts";
import type { Attributes } from "./attributes.ts";
import type { Diagnostic, Severity } from "./diagnostics.ts";

export const ConstructCode = {
  UNKNOWN_ATTRIBUTE: "DIRECTIVE_UNKNOWN_ATTRIBUTE",
  INVALID_ATTRIBUTE: "DIRECTIVE_INVALID_ATTRIBUTE",
  CALLOUT_UNKNOWN_TYPE: "CALLOUT_UNKNOWN_TYPE",
  GRID_CONTENT: "GRID_CONTENT",
  STEPS_CONTENT: "STEPS_CONTENT",
  METRICS_CONTENT: "METRICS_CONTENT",
  FIGURE_CONTENT: "FIGURE_CONTENT",
  CHART_CONTENT: "CHART_CONTENT",
  COLUMNS_RATIO_MISMATCH: "COLUMNS_RATIO_MISMATCH",
  COLUMNS_SINGLE: "COLUMNS_SINGLE",
  TABS_NO_HEADINGS: "TABS_NO_HEADINGS",
  TABS_CONTENT_BEFORE_HEADING: "TABS_CONTENT_BEFORE_HEADING",
  TABS_MIXED_LEVELS: "TABS_MIXED_LEVELS",
  /** An attribute line on the single required content block of grid, steps, metrics, or figure. */
  ATTR_LINE_ON_CONTENT: "ATTR_LINE_ON_CONTENT",
} as const;

const TONES: readonly Tone[] = ["neutral", "info", "success", "warn", "danger"];
const GAPS: readonly Gap[] = ["sm", "md", "lg"];
const CALLOUT_KINDS: readonly CalloutKind[] = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];
const CALLOUT_MARKER = /^\[!([A-Za-z]+)\]([-+])?(?:[ \t]+|(?=\n)|$)/;

interface Span {
  start: number;
  end: number;
}

export function normalizeConstructs(tree: Root, source: string, diagnostics: Diagnostic[]): void {
  const report = (code: string, severity: Severity, message: string, span: Span): void => {
    diagnostics.push({ code, severity, message, ...span });
  };

  function visit(node: Nodes): void {
    if (!("children" in node)) return;
    const parent = node as { children: Nodes[] };
    parent.children = parent.children.map((child) => {
      visit(child);
      return transform(child);
    });
  }

  function transform(node: Nodes): Nodes {
    if (node.type === "directive") return normalizeDirective(node);
    if (node.type === "blockquote") return normalizeCallout(node);
    return node;
  }

  // -------------------------------------------------------------------------

  function normalizeDirective(node: Directive): Nodes {
    switch (node.name) {
      case "card":
        return card(node);
      case "grid":
        return grid(node);
      case "columns":
        return columns(node);
      case "tabs":
        return tabs(node);
      case "steps":
        return steps(node);
      case "metrics":
        return metrics(node);
      case "figure":
        return figure(node);
      default:
        return node;
    }
  }

  function fenceSpan(node: Nodes): Span {
    const start = node.position?.start.offset ?? 0;
    const lineEnd = source.indexOf("\n", start);
    const end = Math.min(lineEnd === -1 ? source.length : lineEnd, node.position?.end.offset ?? source.length);
    return { start, end: Math.max(start, end) };
  }

  function wholeSpan(node: Nodes): Span {
    return { start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0 };
  }

  /**
   * Read the attribute specifier against a per-construct schema. Unknown keys
   * warn; values that fail to parse error and fall back to the default.
   */
  function readAttributes<T extends Record<string, unknown>>(
    attributes: Attributes,
    schema: { [K in keyof T]: { parse: (raw: string) => T[K] | undefined; expected: string; fallback: T[K] } },
    span: Span,
    owner: string,
  ): T {
    const out = {} as T;
    for (const key of Object.keys(schema) as Array<keyof T>) out[key] = schema[key].fallback;
    for (const [key, raw] of Object.entries(attributes.attrs)) {
      const rule = schema[key as keyof T];
      if (!rule) {
        report(
          ConstructCode.UNKNOWN_ATTRIBUTE,
          "warning",
          `"${key}" is not an attribute of ${owner}; it is ignored`,
          span,
        );
        continue;
      }
      const value = rule.parse(raw);
      if (value === undefined) {
        report(
          ConstructCode.INVALID_ATTRIBUTE,
          "error",
          `${owner} ${key}="${raw}" is invalid; expected ${rule.expected}`,
          span,
        );
        continue;
      }
      out[key as keyof T] = value;
    }
    return out;
  }

  const oneOf = <V extends string>(values: readonly V[], fallback: V) => ({
    parse: (raw: string): V | undefined => ((values as readonly string[]).includes(raw) ? (raw as V) : undefined),
    expected: values.map((v) => `"${v}"`).join(", "),
    fallback,
  });
  const boolean = (fallback: boolean) => ({
    parse: (raw: string): boolean | undefined => (raw === "true" ? true : raw === "false" ? false : undefined),
    expected: '"true" or "false"',
    fallback,
  });
  const integer = (min: number, max: number, fallback: number) => ({
    parse: (raw: string): number | undefined => {
      if (!/^\d+$/.test(raw)) return undefined;
      const n = Number(raw);
      return n >= min && n <= max ? n : undefined;
    },
    expected: `an integer from ${min} to ${max}`,
    fallback,
  });

  /** grid, steps, metrics, and figure replace their one content block in HTML, so attributes on it have nowhere to go. */
  function rejectContentAttributes(content: Nodes, owner: string): void {
    const carrier = content as { attributes?: Attributes };
    if (!carrier.attributes) return;
    report(
      ConstructCode.ATTR_LINE_ON_CONTENT,
      "error",
      `an attribute line on the content of ${owner} has no effect; put the attributes in the ${owner} specifier instead`,
      wholeSpan(content),
    );
    delete carrier.attributes;
  }

  function base(node: Directive) {
    return { id: node.attributes.id, classes: node.attributes.classes, position: node.position };
  }

  // -------------------------------------------------------------------------

  function card(node: Directive): Card {
    const a = readAttributes<{ tone: Tone; compact: boolean }>(
      node.attributes,
      {
        tone: oneOf(TONES, "neutral"),
        compact: boolean(false),
      },
      fenceSpan(node),
      "card",
    );
    return {
      type: "card",
      title: node.argument,
      tone: a.tone,
      compact: a.compact,
      ...base(node),
      children: node.children,
    };
  }

  function grid(node: Directive): Grid | Directive {
    const a = readAttributes<{ cols: number; gap: Gap }>(
      node.attributes,
      {
        cols: integer(1, 4, 2),
        gap: oneOf(GAPS, "md"),
      },
      fenceSpan(node),
      "grid",
    );
    const [only] = node.children;
    if (node.children.length !== 1 || only.type !== "list") {
      report(ConstructCode.GRID_CONTENT, "error", "grid content must be exactly one list", wholeSpan(node));
      return node;
    }
    rejectContentAttributes(only, "grid");
    return { type: "grid", cols: a.cols, gap: a.gap, ...base(node), children: [only] };
  }

  function steps(node: Directive): Steps | Directive {
    readAttributes<Record<string, never>>(node.attributes, {}, fenceSpan(node), "steps");
    const [only] = node.children;
    if (node.children.length !== 1 || only.type !== "list" || !only.ordered) {
      report(ConstructCode.STEPS_CONTENT, "error", "steps content must be exactly one ordered list", wholeSpan(node));
      return node;
    }
    rejectContentAttributes(only, "steps");
    return { type: "steps", ...base(node), children: [only] };
  }

  function metrics(node: Directive): Metrics | Directive {
    const a = readAttributes<{ direction: "normal" | "inverse" }>(
      node.attributes,
      {
        direction: oneOf(["normal", "inverse"] as const, "normal"),
      },
      fenceSpan(node),
      "metrics",
    );
    const [only] = node.children;
    if (node.children.length !== 1 || only.type !== "table" || (only.children[0]?.children.length ?? 0) < 2) {
      report(
        ConstructCode.METRICS_CONTENT,
        "error",
        "metrics content must be exactly one table with at least two columns",
        wholeSpan(node),
      );
      return node;
    }
    rejectContentAttributes(only, "metrics");
    return { type: "metrics", direction: a.direction, ...base(node), children: [only] };
  }

  function figure(node: Directive): Figure | Directive {
    const a = readAttributes<{ width: number | null; chart: ChartType | null }>(
      node.attributes,
      {
        chart: {
          parse: (raw: string) => (CHART_TYPES.includes(raw as ChartType) ? (raw as ChartType) : undefined),
          expected: CHART_TYPES.map((v) => `"${v}"`).join(", "),
          fallback: null,
        },
        width: {
          parse: (raw: string) => {
            const m = /^(\d+)%$/.exec(raw);
            if (!m) return undefined;
            const n = Number(m[1]);
            return n >= 1 && n <= 100 ? n : undefined;
          },
          expected: "a percentage from 1% to 100%",
          fallback: null,
        },
      },
      fenceSpan(node),
      "figure",
    );
    const [only] = node.children;
    const isImageParagraph =
      only?.type === "paragraph" && only.children.length === 1 && only.children[0].type === "image";
    if (node.children.length !== 1 || (only.type === "paragraph" && !isImageParagraph)) {
      report(
        ConstructCode.FIGURE_CONTENT,
        "error",
        "figure content must be exactly one block: an image, a table, or a code block",
        wholeSpan(node),
      );
      return node;
    }
    rejectContentAttributes(only, "figure");
    // A chart is drawn from the data, so there has to be data. The other two
    // figure contents carry none: an image is already a picture, and a code
    // fence is §10's business. Reported rather than ignored, because a figure
    // that asked to be a chart and silently was not is the worst of the three.
    if (a.chart !== null && only.type !== "table") {
      report(
        ConstructCode.CHART_CONTENT,
        "error",
        `a figure with chart="${a.chart}" must contain a table; this one contains a ${only.type}`,
        fenceSpan(node),
      );
      return { type: "figure", caption: node.argument, width: a.width, ...base(node), children: node.children };
    }
    return {
      type: "figure",
      caption: node.argument,
      width: a.width,
      ...(a.chart === null ? {} : { chart: a.chart }),
      ...base(node),
      children: node.children,
    };
  }

  function columns(node: Directive): Columns {
    const span = fenceSpan(node);
    const a = readAttributes<{ ratio: number[] | null; gap: Gap }>(
      node.attributes,
      {
        ratio: {
          parse: (raw: string) => {
            if (!/^\d+(:\d+)*$/.test(raw)) return undefined;
            const parts = raw.split(":").map(Number);
            return parts.every((n) => n > 0) ? parts : undefined;
          },
          expected: 'colon-separated positive integers such as "2:1"',
          fallback: null,
        },
        gap: oneOf(GAPS, "md"),
      },
      span,
      "columns",
    );

    const cols: Column[] = [];
    let current: Column = { type: "column", id: null, classes: [], children: [] };
    for (const child of node.children) {
      if (child.type === "separator") {
        const sep = child as SeparatorNode;
        cols.push(current);
        readAttributes<Record<string, never>>(sep.attributes, {}, wholeSpan(sep), "::col");
        current = {
          type: "column",
          id: sep.attributes.id,
          classes: sep.attributes.classes,
          children: [],
          position: sep.position,
        };
        continue;
      }
      current.children.push(child);
    }
    cols.push(current);

    if (cols.length === 1) {
      report(
        ConstructCode.COLUMNS_SINGLE,
        "warning",
        "columns has a single column; add ::col to separate columns",
        span,
      );
    }
    let ratio = a.ratio;
    if (ratio && ratio.length !== cols.length) {
      report(
        ConstructCode.COLUMNS_RATIO_MISMATCH,
        "error",
        `ratio has ${ratio.length} term(s) but there are ${cols.length} column(s)`,
        span,
      );
      ratio = null;
    }
    return { type: "columns", ratio, gap: a.gap, ...base(node), children: cols };
  }

  function tabs(node: Directive): Tabs | Directive {
    const span = fenceSpan(node);
    const headings = node.children.filter((c): c is Heading => c.type === "heading");
    if (headings.length === 0) {
      report(
        ConstructCode.TABS_NO_HEADINGS,
        "error",
        "tabs content must begin with a heading for each tab",
        wholeSpan(node),
      );
      return node;
    }
    if (node.children[0].type !== "heading") {
      report(
        ConstructCode.TABS_CONTENT_BEFORE_HEADING,
        "error",
        "tabs content before the first heading belongs to no tab",
        wholeSpan(node.children[0]),
      );
      return node;
    }
    const depth = headings[0].depth;
    const shallower = headings.find((h) => h.depth < depth);
    if (shallower) {
      report(
        ConstructCode.TABS_MIXED_LEVELS,
        "error",
        `tab headings must all be level ${depth}; found a level ${shallower.depth} heading`,
        wholeSpan(shallower),
      );
      return node;
    }

    const tabList: Tab[] = [];
    for (const child of node.children) {
      if (child.type === "heading" && child.depth === depth) {
        const tab: Tab = { type: "tab", depth, label: child.children, children: [], position: child.position };
        if (child.attributes) tab.attributes = child.attributes;
        tabList.push(tab);
      } else {
        tabList[tabList.length - 1].children.push(child);
      }
    }

    const a = readAttributes<{ active: number }>(
      node.attributes,
      {
        active: integer(1, tabList.length, 1),
      },
      span,
      "tabs",
    );
    return { type: "tabs", active: a.active, ...base(node), children: tabList };
  }

  // -------------------------------------------------------------------------

  function normalizeCallout(node: Blockquote): Nodes {
    const first = node.children[0];
    if (first?.type !== "paragraph") return node;
    const lead = first.children[0];
    if (lead?.type !== "text") return node;
    const match = CALLOUT_MARKER.exec(lead.value);
    if (!match) return node;

    const kind = match[1].toUpperCase();
    if (!(CALLOUT_KINDS as readonly string[]).includes(kind)) {
      report(
        ConstructCode.CALLOUT_UNKNOWN_TYPE,
        "error",
        `"[!${match[1]}]" is not a callout type; expected ${CALLOUT_KINDS.map((k) => `[!${k}]`).join(", ")}`,
        wholeSpan(lead),
      );
      return node;
    }
    const fold = match[2] === "-" ? "closed" : match[2] === "+" ? "open" : null;

    const { title, body } = splitTitle(first, match[0].length);
    const children = body ? [body, ...node.children.slice(1)] : node.children.slice(1);
    const callout: Callout = {
      type: "callout",
      kind: kind as CalloutKind,
      title,
      fold,
      children,
      position: node.position,
    };
    if (node.attributes) callout.attributes = node.attributes;
    return callout;
  }

  /** Split the first paragraph after the marker into same-line title content and the remaining body paragraph. */
  function splitTitle(
    paragraph: Paragraph,
    markerLength: number,
  ): { title: PhrasingContent[] | null; body: Paragraph | null } {
    const title: PhrasingContent[] = [];
    const rest: PhrasingContent[] = [];
    let inTitle = true;
    paragraph.children.forEach((child, index) => {
      if (!inTitle) {
        rest.push(child);
        return;
      }
      if (child.type === "break") {
        inTitle = false;
        return;
      }
      if (child.type !== "text") {
        title.push(child);
        return;
      }
      const value = index === 0 ? child.value.slice(markerLength) : child.value;
      const newline = value.indexOf("\n");
      if (newline === -1) {
        if (value !== "") title.push(textNode(value));
        return;
      }
      const head = value.slice(0, newline);
      const tail = value.slice(newline + 1);
      if (head !== "") title.push(textNode(head));
      if (tail !== "") rest.push(textNode(tail));
      inTitle = false;
    });
    trimTrailingSpace(title);
    return {
      title: title.length > 0 ? title : null,
      body: rest.length > 0 ? { type: "paragraph", children: rest, position: paragraph.position } : null,
    };
  }

  function textNode(value: string): Text {
    return { type: "text", value };
  }

  function trimTrailingSpace(nodes: PhrasingContent[]): void {
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") {
      last.value = last.value.replace(/[ \t]+$/, "");
      if (last.value === "") nodes.pop();
    }
  }

  // Runs last so every helper above, including the arrow-function ones, is initialized.
  visit(tree);
}

export type { RootContent };
