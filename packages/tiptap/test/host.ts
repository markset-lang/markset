/**
 * A host whose schema is Streamlane's body editor, by name and shape: StarterKit,
 * TableKit (a `tableHeader` first row, `block+` cells carrying colspan, rowspan
 * and colwidth), TaskList and TaskItem, a block `image`, and two things Markdown
 * has no word for, a comment highlight mark and a person mention.
 *
 * Markset's parser reads neither strikethrough nor task lists (remark-gfm does),
 * so those arrive here as the mdast remark-gfm makes: `delete`, and list items
 * whose `checked` is a boolean.
 */
import type { List, ListItem, Nodes, Paragraph, Image } from "mdast";
import type { ConvertHost, JSONNode } from "../src/convert.ts";

const isTaskList = (node: Nodes): node is List =>
  node.type === "list" && node.children.length > 0 && node.children.every((item) => typeof item.checked === "boolean");

const isImageParagraph = (node: Nodes): node is Paragraph =>
  node.type === "paragraph" && node.children.length === 1 && node.children[0].type === "image";

export const STREAMLANE: ConvertHost = {
  // Markset's inline image is renamed away, so `image` is the host's block image.
  names: { tableHeader: "tableHeader", image: "inlineImage" },
  cellContent: "paragraph",
  node: {
    toJSON(node, context) {
      if (isTaskList(node)) {
        return {
          type: "taskList",
          content: node.children.map((item) => ({
            type: "taskItem",
            attrs: { checked: item.checked },
            content: context.blocks(item.children),
          })),
        };
      }
      if (isImageParagraph(node)) {
        const image = node.children[0] as Image;
        return { type: "image", attrs: { src: image.url, alt: image.alt ?? null, title: image.title ?? null } };
      }
      return undefined;
    },
    toMdast(node, context) {
      switch (node.type) {
        case "taskList":
          return {
            type: "list",
            ordered: false,
            start: null,
            spread: false,
            children: (node.content ?? []).map(
              (item): ListItem => ({
                type: "listItem",
                spread: false,
                checked: Boolean(item.attrs?.checked),
                children: context.blocks(item.content ?? []) as ListItem["children"],
              }),
            ),
          };
        case "image":
          return {
            type: "paragraph",
            children: [
              {
                type: "image",
                url: String(node.attrs?.src ?? ""),
                alt: (node.attrs?.alt as string | null) ?? null,
                title: (node.attrs?.title as string | null) ?? null,
              },
            ],
          };
        case "mention":
          return { type: "text", value: `@${String(node.attrs?.label ?? "")}` };
        default:
          return undefined;
      }
    },
  },
  mark: {
    toJSON: (node) => (node.type === "delete" ? { type: "strike" } : undefined),
    toMdast(mark) {
      if (mark.type === "strike") return { type: "delete", children: [] };
      if (mark.type === "commentHighlight") return null;
      return undefined;
    },
  },
};

/** What TableKit adds to every cell, which Markset has no field for. */
export function withCellAttributes(json: JSONNode): JSONNode {
  const out: JSONNode = { ...json };
  if (json.type === "tableCell" || json.type === "tableHeader") {
    out.attrs = { colspan: 1, rowspan: 1, colwidth: null, ...json.attrs };
  }
  if (json.content) out.content = json.content.map(withCellAttributes);
  return out;
}
