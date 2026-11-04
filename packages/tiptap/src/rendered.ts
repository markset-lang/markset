/**
 * Node views that draw each construct as the HTML renderer does, for an editor
 * that only shows a document (`editable: false`): a callout with its body, a
 * grid of items rather than a list, steps, metrics as tiles, a figure with its
 * caption where the renderer puts it, and tabs as a working tab strip.
 *
 * The editing views keep a construct's content where ProseMirror can edit it,
 * which is why a grid shows its list and metrics their table. Nothing is edited
 * here, so each view draws its construct whole, from the node, in
 * render-html's element structure, classes and attributes, and the renderer's
 * stylesheet (or `css/constructs.css`, the same rules scoped to `.ms-scope`)
 * styles it as it styles a rendered page. A construct inside another is drawn
 * by the outer one; other nodes inside are drawn by their own schema's
 * `renderHTML`.
 *
 * The open tab is the view's own: a radio input, as on a rendered page, so it
 * is kept while the document is shown, survives an update, and is never
 * written to the document.
 */
import type { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import type { BlockAttributes, ConstructName, NodeName } from "./model.ts";

export interface RenderedViewsOptions {
  /** The host's table node, as given to MarksetConstructs. */
  tableNode?: string;
  /** The node a figure shows its image with, as given to MarksetConstructs. */
  imageNode?: string;
}

const CALLOUT_LABEL: Record<string, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

const RENDERED: readonly ConstructName[] = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"];

/**
 * A tabs construct with no id needs a name for its radio inputs, and a callout
 * an id for its title, that nothing else on the page has. render-html numbers
 * them per document; views are drawn one at a time, by any number of editors on
 * one page, so these count across them all.
 */
let tabsCount = 0;
let calloutCount = 0;

/**
 * Node views for a read-only editor, by construct name, for the `nodeViews`
 * option of `Markset` or `MarksetConstructs`. The views draw; they do not edit.
 */
export function renderedNodeViews(options: RenderedViewsOptions = {}): Partial<Record<NodeName, NodeViewRenderer>> {
  const views: Partial<Record<NodeName, NodeViewRenderer>> = {};
  for (const name of RENDERED) views[name] = (props) => new RenderedView(props, options);
  return views;
}

class RenderedView implements NodeView {
  dom: HTMLElement;
  readonly #painter: Painter;
  #node: PMNode;

  constructor(props: NodeViewRendererProps, options: RenderedViewsOptions) {
    this.#node = props.node;
    this.#painter = new Painter(props.view.dom.ownerDocument, props.editor.schema, options);
    this.dom = this.#painter.construct(props.node);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.#node.type) return false;
    const open = openTabs(this.dom);
    const dom = this.#painter.construct(node);
    this.dom.replaceWith(dom);
    this.dom = dom;
    this.#node = node;
    reopenTabs(dom, open);
    return true;
  }

  /** The tab strip's clicks are the view's: they change the open tab and nothing else. */
  stopEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".ms-tablist, .ms-tab-input") !== null;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

/** Every tabs construct the view draws, outermost first, in document order. */
function tabsIn(dom: HTMLElement): Element[] {
  return [...(dom.matches(".ms-tabs") ? [dom] : []), ...dom.querySelectorAll(".ms-tabs")];
}

function inputsOf(tabs: Element): HTMLInputElement[] {
  return [...tabs.children].filter((child): child is HTMLInputElement => child.matches("input.ms-tab-input"));
}

/** Which tab each tabs construct in the view has open, by its place: a redrawn one has new names. */
function openTabs(dom: HTMLElement): number[] {
  return tabsIn(dom).map((tabs) => inputsOf(tabs).findIndex((input) => input.checked));
}

function reopenTabs(dom: HTMLElement, open: number[]): void {
  tabsIn(dom).forEach((tabs, index) => {
    const inputs = inputsOf(tabs);
    const at = open[index];
    if (at === undefined || at < 0 || at >= inputs.length) return;
    inputs.forEach((input, place) => {
      input.checked = place === at;
    });
  });
}

/** Draws nodes as render-html would. */
class Painter {
  readonly #document: Document;
  readonly #serializer: DOMSerializer;
  readonly #table: string;
  readonly #image: string;

  constructor(document: Document, schema: PMNode["type"]["schema"], options: RenderedViewsOptions) {
    this.#document = document;
    this.#serializer = DOMSerializer.fromSchema(schema);
    this.#table = options.tableNode ?? "table";
    this.#image = options.imageNode ?? "figureImage";
  }

  el(tag: string, attributes: Record<string, string | null | undefined> = {}, children: Node[] = []): HTMLElement {
    const element = this.#document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) element.setAttribute(name, value);
    }
    element.append(...children);
    return element;
  }

  /** Inline content, through the schema's own marks and inline nodes. */
  inline(node: PMNode | null | undefined): Node[] {
    if (!node) return [];
    return [...this.#serializer.serializeFragment(node.content, { document: this.#document }).childNodes];
  }

  /** The children of `node` from `from` on, each drawn as a block. */
  blocks(node: PMNode, from = 0): Node[] {
    const out: Node[] = [];
    node.forEach((child, _offset, index) => {
      if (index >= from) out.push(this.block(child, node));
    });
    return out;
  }

  block(node: PMNode, parent: PMNode | null): Node {
    const name = node.type.name;
    if ((RENDERED as readonly string[]).includes(name)) return this.construct(node);
    if (name === this.#table) return this.table(node);
    if (name === this.#image) return this.image(node);
    // A list's items, as mdast-util-to-hast draws them: in a tight list a paragraph is only its text.
    if (parent && isList(parent)) return this.item(node, tight(parent));
    // Anything else by its schema's renderHTML, with its children drawn here.
    const { dom, contentDOM } = DOMSerializer.renderSpec(this.#document, node.type.spec.toDOM!(node));
    if (contentDOM) {
      if (node.isTextblock) contentDOM.append(...this.inline(node));
      else
        node.forEach((child) => {
          contentDOM.append(this.block(child, node));
        });
    }
    return dom;
  }

  item(item: PMNode, tightList: boolean, base: string[] = []): HTMLElement {
    const li = this.el("li", attributeHtml(item.attrs.attributes, base));
    item.forEach((child) => {
      if (tightList && child.type.name === "paragraph") li.append(...this.inline(child));
      else li.append(this.block(child, item));
    });
    return li;
  }

  image(node: PMNode): HTMLElement {
    return this.el("img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title });
  }

  /** A table as GFM's: a head row of `th`, the rest in a body, each cell's alignment on it. */
  table(node: PMNode, caption?: Node[]): HTMLElement {
    const align = (node.attrs.align as Array<string | null> | undefined) ?? [];
    const row = (tr: PMNode, tag: string) =>
      this.el(
        "tr",
        {},
        mapChildren(tr, (cell, index) =>
          // render-html scopes every header cell: a GFM table's one header row heads columns.
          this.el(tag, { align: align[index] ?? null, scope: tag === "th" ? "col" : null }, this.cell(cell)),
        ),
      );
    const rows = mapChildren(node, (tr) => tr);
    const parts: Node[] = [];
    if (caption) parts.push(this.el("caption", {}, caption));
    if (rows[0]) parts.push(this.el("thead", {}, [row(rows[0], "th")]));
    if (rows.length > 1)
      parts.push(
        this.el(
          "tbody",
          {},
          rows.slice(1).map((tr) => row(tr, "td")),
        ),
      );
    return this.el("table", attributeHtml(node.attrs.attributes, []), parts);
  }

  /** A cell's text: inline content, or a host's paragraphs (TableKit's `block+`), one line. */
  cell(cell: PMNode): Node[] {
    if (cell.inlineContent) return this.inline(cell);
    const out: Node[] = [];
    cell.forEach((paragraph, _offset, index) => {
      if (index > 0) out.push(this.#document.createTextNode(" "));
      out.push(...(paragraph.isTextblock ? this.inline(paragraph) : [this.block(paragraph, cell)]));
    });
    return out;
  }

  construct(node: PMNode): HTMLElement {
    const a = node.attrs;
    const identity = (base: string) => identityHtml(a.id, a.classes, base);
    switch (node.type.name as ConstructName) {
      case "callout": {
        const title = node.firstChild;
        const label =
          title && title.childCount > 0 ? this.inline(title) : [this.#document.createTextNode(CALLOUT_LABEL[a.kind])];
        const body = this.el("div", { class: "ms-callout-body" }, this.blocks(node, 1));
        const props = { ...attributeHtml(a.attributes, ["ms-callout"]), "data-type": String(a.kind).toLowerCase() };
        if (a.fold) {
          const summary = this.el("summary", { class: "ms-callout-title" }, label);
          return this.el("details", { ...props, open: a.fold === "open" ? "" : null }, [summary, body]);
        }
        const titleId = `${a.attributes?.id ?? `ms-callout-${++calloutCount}`}-title`;
        const heading = this.el("div", { class: "ms-callout-title", id: titleId }, label);
        return this.el("div", { ...props, role: "note", "aria-labelledby": titleId }, [heading, body]);
      }
      case "card": {
        const titled = node.firstChild?.type.name === "cardTitle";
        const children = [
          ...(titled ? [this.el("h3", { class: "ms-card-title" }, this.inline(node.firstChild))] : []),
          ...this.blocks(node, titled ? 1 : 0),
        ];
        return this.el(
          "section",
          { ...identity("ms-card"), "data-tone": a.tone, "data-compact": a.compact ? "" : null },
          children,
        );
      }
      case "grid": {
        const list = node.firstChild;
        const items = list
          ? mapChildren(list, (item) =>
              this.el("div", attributeHtml(item.attrs.attributes, ["ms-grid-item"]), this.blocks(item)),
            )
          : [];
        return this.el("div", { ...identity("ms-grid"), "data-cols": String(a.cols), "data-gap": a.gap }, items);
      }
      case "columns": {
        const ratio = a.ratio as number[] | null;
        const columns = mapChildren(node, (column) =>
          this.el("div", identityHtml(column.attrs.id, column.attrs.classes, "ms-column"), this.blocks(column)),
        );
        return this.el(
          "div",
          {
            ...identity("ms-columns"),
            "data-gap": a.gap,
            style: ratio ? `--ms-ratio: ${ratio.map((n) => `${n}fr`).join(" ")}` : null,
          },
          columns,
        );
      }
      case "tabs": {
        const name = a.id ?? `ms-tabs-${++tabsCount}`;
        const tabs = mapChildren(node, (tab) => tab);
        const inputs = tabs.map((_, index) =>
          this.el("input", {
            class: "ms-tab-input",
            type: "radio",
            name,
            id: `${name}-${index + 1}`,
            checked: index + 1 === a.active ? "" : null,
          }),
        );
        const labels = tabs.map((tab, index) =>
          this.el(
            "label",
            { class: "ms-tab", id: `${name}-${index + 1}-label`, for: `${name}-${index + 1}` },
            this.inline(tab.firstChild),
          ),
        );
        const panels = tabs.map((tab, index) =>
          this.el(
            "div",
            {
              ...attributeHtml(tab.attrs.attributes, ["ms-tabpanel"]),
              "data-index": String(index + 1),
              "aria-labelledby": `${name}-${index + 1}-label`,
            },
            this.blocks(tab, 1),
          ),
        );
        return this.el("div", identity("ms-tabs"), [
          ...inputs,
          this.el("div", { class: "ms-tablist" }, labels),
          ...panels,
        ]);
      }
      case "steps": {
        const list = node.firstChild;
        const start = list?.attrs.start;
        const items = list ? mapChildren(list, (item) => this.item(item, tight(list), ["ms-step"])) : [];
        return this.el(
          "ol",
          { ...identity("ms-steps"), start: typeof start === "number" && start !== 1 ? String(start) : null },
          items,
        );
      }
      case "metrics": {
        const rows = node.firstChild ? mapChildren(node.firstChild, (row) => row).slice(1) : [];
        const tiles = rows.map((row) => {
          const [label, value, delta] = mapChildren(row, (cell) => cell);
          const parts = [
            this.el("div", { class: "ms-metric-label" }, label ? this.cell(label) : []),
            this.el("div", { class: "ms-metric-value" }, value ? this.cell(value) : []),
          ];
          let direction: string | null = null;
          if (delta) {
            const sign = delta.textContent.trim()[0];
            const moved = sign === "+" ? "up" : sign === "-" ? "down" : null;
            if (moved) direction = a.direction === "inverse" ? (moved === "up" ? "down" : "up") : moved;
            parts.push(this.el("div", { class: "ms-metric-delta" }, this.cell(delta)));
          }
          return this.el("div", { class: "ms-metric", "data-direction": direction }, parts);
        });
        return this.el("div", identity("ms-metrics"), tiles);
      }
      case "figure": {
        const captioned = node.firstChild?.type.name === "figureCaption";
        const caption = captioned ? this.inline(node.firstChild) : null;
        const content = node.child(node.childCount - 1);
        const children: Node[] = [];
        // A table's caption is its first child, which makes it the table's name (§4.8).
        if (content.type.name === this.#table) children.push(this.table(content, caption ?? undefined));
        else {
          children.push(this.block(content, node));
          if (caption) children.push(this.el("figcaption", {}, caption));
        }
        return this.el(
          "figure",
          {
            ...identity("ms-figure"),
            style: a.width !== null ? `--ms-width: ${a.width}%` : null,
            "data-chart": a.chart ?? null,
          },
          children,
        );
      }
    }
    return this.el("div");
  }
}

function mapChildren<T>(node: PMNode, map: (child: PMNode, index: number) => T): T[] {
  const out: T[] = [];
  node.forEach((child, _offset, index) => {
    out.push(map(child, index));
  });
  return out;
}

function isList(node: PMNode): boolean {
  return node.type.spec.group?.split(" ").includes("list") ?? false;
}

/** Whether a list is tight, as mdast-util-to-hast decides it: no item spread, and none holding more than one block. */
function tight(list: PMNode): boolean {
  if (list.attrs.spread === true) return false;
  let loose = false;
  list.forEach((item) => {
    const spread = item.attrs.spread;
    if (typeof spread === "boolean" ? spread : item.childCount > 1) loose = true;
  });
  return !loose;
}

function identityHtml(id: string | null, classes: string[] | undefined, base: string): Record<string, string | null> {
  return { class: [base, ...(classes ?? [])].join(" "), id: id ?? null };
}

/** §2.5 attributes as HTML: the base classes first, the author's after, an id, and one `data-` attribute per key. */
function attributeHtml(attributes: BlockAttributes | undefined, base: string[]): Record<string, string | null> {
  const html: Record<string, string | null> = {};
  const classes = [...base, ...(attributes?.classes ?? [])];
  if (classes.length > 0) html.class = classes.join(" ");
  if (attributes?.id) html.id = attributes.id;
  for (const [key, value] of Object.entries(attributes?.attrs ?? {})) html[`data-${key}`] = value;
  return html;
}
