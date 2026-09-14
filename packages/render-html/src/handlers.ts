/**
 * mdast-util-to-hast handlers for the Markset nodes (spec §4 HTML column,
 * §2.2 spans). Element shapes and the ms- class vocabulary are normative;
 * the conformance suite pins them.
 */
import type { Element, ElementContent, Properties } from "hast";
import type { ListItem, PhrasingContent, TableCell } from "mdast";
import { defaultHandlers, type Handlers, type State } from "mdast-util-to-hast";
import type {
  Callout, CalloutKind, Card, Columns, Directive, Figure, Grid, Metrics, Span, Steps, Tabs,
} from "@markset/parser";

const CALLOUT_LABEL: Record<CalloutKind, string> = {
  NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning", CAUTION: "Caution",
};

export function marksetHandlers(): Handlers {
  let tabsCount = 0;

  const el = (tagName: string, properties: Properties, children: ElementContent[]): Element =>
    ({ type: "element", tagName, properties, children });
  const block = (tagName: string, properties: Properties, children: ElementContent[]): Element =>
    el(tagName, properties, wrap(children));
  const wrap = (children: ElementContent[]): ElementContent[] => (children.length === 0 ? [] : loose(children));
  const loose = (children: ElementContent[]): ElementContent[] => {
    const out: ElementContent[] = [{ type: "text", value: "\n" }];
    for (const child of children) out.push(child, { type: "text", value: "\n" });
    return out;
  };
  const inline = (state: State, nodes: PhrasingContent[]): ElementContent[] =>
    state.all({ type: "paragraph", children: nodes });
  const classes = (base: string, extra: string[]): string[] => [base, ...extra];
  const finish = (state: State, node: Parameters<State["patch"]>[0], result: Element): Element => {
    state.patch(node, result);
    return result;
  };

  return {
    callout(state, node: Callout) {
      const label = node.title ? inline(state, node.title) : [{ type: "text", value: CALLOUT_LABEL[node.kind] } as ElementContent];
      const body = block("div", { className: ["ms-callout-body"] }, state.all(node));
      const props: Properties = { className: classes("ms-callout", node.attributes?.classes ?? []) };
      if (node.attributes?.id) props.id = node.attributes.id;
      props.dataType = node.kind.toLowerCase();
      for (const [key, value] of Object.entries(node.attributes?.attrs ?? {})) props[`data-${key}`] = value;
      if (node.fold) {
        const summary = el("summary", { className: ["ms-callout-title"] }, label);
        if (node.fold === "open") props.open = true;
        return finish(state, node, block("details", props, [summary, body]));
      }
      const title = el("div", { className: ["ms-callout-title"] }, label);
      return finish(state, node, block("div", props, [title, body]));
    },

    card(state, node: Card) {
      const props: Properties = { className: classes("ms-card", node.classes) };
      if (node.id) props.id = node.id;
      props.dataTone = node.tone;
      if (node.compact) props.dataCompact = true;
      const children: ElementContent[] = [];
      if (node.title) children.push(el("h3", { className: ["ms-card-title"] }, inline(state, node.title)));
      children.push(...state.all(node));
      return finish(state, node, block("section", props, children));
    },

    grid(state, node: Grid) {
      const props: Properties = { className: classes("ms-grid", node.classes) };
      if (node.id) props.id = node.id;
      props.dataCols = String(node.cols);
      props.dataGap = node.gap;
      const items = node.children[0].children.map((item: ListItem) =>
        block("div", { className: ["ms-grid-item"] }, state.all(item)));
      return finish(state, node, block("div", props, items));
    },

    columns(state, node: Columns) {
      const props: Properties = { className: classes("ms-columns", node.classes) };
      if (node.id) props.id = node.id;
      props.dataGap = node.gap;
      if (node.ratio) props.style = `--ms-ratio: ${node.ratio.map((n) => `${n}fr`).join(" ")}`;
      const cols = node.children.map((column) => {
        const colProps: Properties = { className: classes("ms-column", column.classes) };
        if (column.id) colProps.id = column.id;
        return block("div", colProps, state.all(column));
      });
      return finish(state, node, block("div", props, cols));
    },

    tabs(state, node: Tabs) {
      tabsCount++;
      const name = node.id ?? `ms-tabs-${tabsCount}`;
      const props: Properties = { className: classes("ms-tabs", node.classes) };
      if (node.id) props.id = node.id;
      const inputs = node.children.map((_, index) => {
        const input: Properties = { className: ["ms-tab-input"], type: "radio", name, id: `${name}-${index + 1}` };
        if (index + 1 === node.active) input.checked = true;
        return el("input", input, []);
      });
      const labels = node.children.map((tab, index) =>
        el("label", { className: ["ms-tab"], htmlFor: [`${name}-${index + 1}`] }, inline(state, tab.label)));
      const panels = node.children.map((tab, index) =>
        block("div", { className: ["ms-tabpanel"], dataIndex: String(index + 1) }, state.all(tab)));
      const tablist = block("div", { className: ["ms-tablist"] }, labels);
      return finish(state, node, block("div", props, [...inputs, tablist, ...panels]));
    },

    steps(state, node: Steps) {
      const list = node.children[0];
      const props: Properties = { className: classes("ms-steps", node.classes) };
      if (node.id) props.id = node.id;
      if (typeof list.start === "number" && list.start !== 1) props.start = list.start;
      const items = list.children.map((item) => {
        const li = defaultHandlers.listItem(state, item, list) as Element;
        li.properties = { className: ["ms-step"], ...li.properties };
        return li;
      });
      return finish(state, node, block("ol", props, items));
    },

    metrics(state, node: Metrics) {
      const props: Properties = { className: classes("ms-metrics", node.classes) };
      if (node.id) props.id = node.id;
      const rows = node.children[0].children.slice(1);
      const items = rows.map((row) => {
        const [label, value, delta] = row.children;
        const metricProps: Properties = { className: ["ms-metric"] };
        const parts: ElementContent[] = [
          el("div", { className: ["ms-metric-label"] }, cellContent(state, label)),
          el("div", { className: ["ms-metric-value"] }, cellContent(state, value)),
        ];
        if (delta) {
          const sign = cellText(delta).trim()[0];
          const direction = sign === "+" ? "up" : sign === "-" ? "down" : null;
          if (direction) metricProps.dataDirection = node.direction === "inverse" ? (direction === "up" ? "down" : "up") : direction;
          parts.push(el("div", { className: ["ms-metric-delta"] }, cellContent(state, delta)));
        }
        return block("div", metricProps, parts);
      });
      return finish(state, node, block("div", props, items));
    },

    figure(state, node: Figure) {
      const props: Properties = { className: classes("ms-figure", node.classes) };
      if (node.id) props.id = node.id;
      if (node.width !== null) props.style = `--ms-width: ${node.width}%`;
      const [content] = node.children;
      const body = content.type === "paragraph" ? state.all(content) : state.all(node);
      const children = [...body];
      if (node.caption) children.push(el("figcaption", {}, inline(state, node.caption)));
      return finish(state, node, block("figure", props, children));
    },

    span(state, node: Span) {
      const props: Properties = { className: classes("ms-span", node.attributes.classes) };
      if (node.attributes.id) props.id = node.attributes.id;
      for (const [key, value] of Object.entries(node.attributes.attrs)) props[`data-${key}`] = value;
      return finish(state, node, el("span", props, state.all(node)));
    },

    /** A directive that failed validation: its content, no wrapper. */
    directive(state, node: Directive) {
      return state.all(node);
    },

    /** Only reachable when misplaced. */
    separator() {
      return undefined;
    },
  };

  function cellContent(state: State, cell: TableCell | undefined): ElementContent[] {
    return cell ? state.all(cell) : [];
  }
}

function cellText(cell: TableCell): string {
  let out = "";
  const visit = (node: { type: string; value?: string; children?: unknown[] }): void => {
    if (typeof node.value === "string" && node.type !== "html") out += node.value;
    for (const child of node.children ?? []) visit(child as { type: string });
  };
  visit(cell);
  return out;
}
