/**
 * Lower a Markset tree to plain mdast (spec §3, "Downgrade output"), applying
 * each construct's §4 downgrade rule. Returns a new tree; the input is not
 * modified. Card titles become headings one level below the current section
 * depth, tracked in document order across every heading the output contains.
 */
import type {
  BlockContent,
  DefinitionContent,
  Heading,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import type { CalloutKind } from "@markset/parser";

const CALLOUT_LABEL: Record<CalloutKind, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

export function downgradeTree(root: Root): Root {
  let sectionDepth = 0;
  const children = lowerBlocks(root.children);
  return { type: "root", children };

  function lowerBlocks(nodes: RootContent[]): RootContent[] {
    const out: RootContent[] = [];
    for (const node of nodes) out.push(...lowerBlock(node));
    return out;
  }

  function lowerBlock(node: RootContent): RootContent[] {
    switch (node.type) {
      case "heading": {
        sectionDepth = node.depth;
        return [lowerGeneric(node)];
      }
      case "callout": {
        const label: PhrasingContent[] = [
          { type: "strong", children: [{ type: "text", value: `${CALLOUT_LABEL[node.kind]}:` }] },
        ];
        if (node.title) label.push({ type: "text", value: " " }, ...lowerInline(node.title));
        const first: Paragraph = { type: "paragraph", children: label };
        return [
          {
            type: "blockquote",
            children: [first, ...(lowerBlocks(node.children) as Array<BlockContent | DefinitionContent>)],
          },
        ];
      }
      case "card": {
        const out: RootContent[] = [];
        if (node.title) {
          const depth = Math.min(sectionDepth + 1, 6) as Heading["depth"];
          sectionDepth = depth;
          out.push({ type: "heading", depth, children: lowerInline(node.title) });
        }
        out.push(...lowerBlocks(node.children));
        return out;
      }
      case "grid":
      case "steps":
      case "metrics":
        return lowerBlocks(node.children);
      case "columns":
        return lowerBlocks(node.children.flatMap((column) => column.children));
      case "tabs": {
        const out: RootContent[] = [];
        for (const tab of node.children) {
          sectionDepth = tab.depth;
          out.push({ type: "heading", depth: tab.depth, children: lowerInline(tab.label) });
          out.push(...lowerBlocks(tab.children));
        }
        return out;
      }
      case "figure": {
        const out = lowerBlocks(node.children);
        if (node.caption)
          out.push({ type: "paragraph", children: [{ type: "emphasis", children: lowerInline(node.caption) }] });
        return out;
      }
      case "directive":
        // Malformed or unknown: keep the content, drop the fence.
        return lowerBlocks(node.children);
      case "separator":
      case "attributeLine":
      case "column":
      case "tab":
        // Only reachable when misplaced; nothing to show.
        return [];
      default:
        return [lowerGeneric(node) as RootContent];
    }
  }

  /** Recurse into an ordinary mdast node, lowering nested blocks and inline spans and dropping block attributes (§2.5). */
  function lowerGeneric<T extends Nodes>(node: T): T {
    const { attributes: _dropped, ...rest } = node as T & { attributes?: unknown };
    if (!("children" in rest)) return rest as T;
    const kids = rest.children as Nodes[];
    const lowered = isPhrasingParent(node)
      ? lowerInline(kids as PhrasingContent[])
      : lowerBlocks(kids as RootContent[]);
    return { ...rest, children: lowered } as T;
  }

  function lowerInline(nodes: PhrasingContent[]): PhrasingContent[] {
    const out: PhrasingContent[] = [];
    for (const node of nodes) {
      if (node.type === "span") {
        out.push(...lowerInline(node.children));
      } else if ("children" in node) {
        out.push({ ...node, children: lowerInline(node.children as PhrasingContent[]) } as PhrasingContent);
      } else {
        out.push({ ...node });
      }
    }
    return mergeText(out);
  }

  function isPhrasingParent(node: Nodes): boolean {
    return (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "tableCell" ||
      node.type === "emphasis" ||
      node.type === "strong" ||
      node.type === "link" ||
      node.type === "linkReference" ||
      node.type === "delete"
    );
  }

  /** Adjacent text nodes left by span removal merge, so the output has the shape a fresh parse would. */
  function mergeText(nodes: PhrasingContent[]): PhrasingContent[] {
    const out: PhrasingContent[] = [];
    for (const node of nodes) {
      const last = out[out.length - 1];
      if (node.type === "text" && last?.type === "text") {
        out[out.length - 1] = { type: "text", value: last.value + node.value };
      } else {
        out.push(node);
      }
    }
    return out;
  }
}
