/**
 * The edits shown on the visual-editing page, made by the package itself at
 * build time. Each construct is loaded with fromMarkset, changed the way an
 * editor would change it, and saved with toMarkset against the source it came
 * from; the page shows the diff. So the page cannot claim a smaller diff than
 * the package produces, and a regression in the serializer changes the page.
 *
 * The build also checks the claim the page opens with: every sample, saved
 * without an edit, is byte-identical. If it is not, the build fails.
 */
import { fromMarkset, toMarkset, type ConstructName, type JSONNode } from "@markset-lang/tiptap";

interface Demo {
  construct: ConstructName;
  /** What the edit is, as a reader would say it. */
  what: string;
  source: string;
  edit: (doc: JSONNode) => void;
}

/** The first node of a type, depth first. */
function find(node: JSONNode, type: string): JSONNode {
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findOrNull(child, type);
    if (found) return found;
  }
  throw new Error(`no ${type} in the sample`);
}

function findOrNull(node: JSONNode, type: string): JSONNode | null {
  try {
    return find(node, type);
  } catch {
    return null;
  }
}

function setText(node: JSONNode, text: string): void {
  node.content = [{ type: "text", text }];
}

const DEMOS: Demo[] = [
  {
    construct: "callout",
    what: "Change a note to a tip",
    source: "> [!NOTE] Before you start\n> Run the _setup_ script first.\n>\n> It takes a minute.\n",
    edit: (doc) => {
      find(doc, "callout").attrs = { ...find(doc, "callout").attrs, kind: "TIP" };
    },
  },
  {
    construct: "card",
    what: "Retype one list item",
    source: ":::card[Pricing]{tone=info}\nStarts at _$9_ a month.\n\n* Unlimited documents\n* One seat\n:::\n",
    edit: (doc) => {
      const list = find(doc, "bulletList");
      setText(find(list.content![1], "paragraph"), "Three seats");
    },
  },
  {
    construct: "grid",
    what: "Add an item",
    source: ":::grid{cols=3}\n* **Fast**, sub-50 ms cold start\n* **Small**, 4 kB gzipped\n:::\n",
    edit: (doc) => {
      const list = find(doc, "bulletList");
      const item = structuredClone(list.content![1]);
      find(item, "paragraph").content = [
        { type: "text", text: "Typed", marks: [{ type: "bold" }] },
        { type: "text", text: ", no any in the public API" },
      ];
      list.content!.push(item);
    },
  },
  {
    construct: "columns",
    what: "Make the columns equal",
    source: '::::columns{ratio="2:1"}\nThe main argument.\n\n::col\n\nA sidebar.\n::::\n',
    edit: (doc) => {
      const columns = find(doc, "columns");
      columns.attrs = { ...columns.attrs, ratio: [1, 1] };
    },
  },
  {
    construct: "tabs",
    what: "Rename a tab",
    source: ":::tabs\n### macOS\n`brew install markset`\n\n### Windows\n`winget install markset`\n:::\n",
    edit: (doc) => {
      setText(find(doc, "tabLabel"), "Mac");
    },
  },
  {
    construct: "steps",
    what: "Add a step",
    source: ":::steps\n1. Install the CLI.\n2. Run `markset check`.\n:::\n",
    edit: (doc) => {
      const list = find(doc, "orderedList");
      const step = structuredClone(list.content![0]);
      setText(find(step, "paragraph"), "Commit the result.");
      list.content!.push(step);
    },
  },
  {
    construct: "metrics",
    what: "Update one figure",
    source:
      ":::metrics\n| Metric  | Value | Δ     |\n|---------|-------|-------|\n| Revenue | $4.2M | +12%  |\n| Churn   | 2.1%  | -0.4% |\n:::\n",
    edit: (doc) => {
      const row = find(doc, "table").content![1];
      setText(row.content![1], "$4.4M");
    },
  },
  {
    construct: "figure",
    what: "Reword the caption",
    source: ":::figure[Request lifecycle]{#fig-flow width=60%}\n![](lifecycle.svg)\n:::\n",
    edit: (doc) => {
      setText(find(doc, "figureCaption"), "Request lifecycle, ingress to response");
    },
  },
];

/** Lines of `before` and `after` as a unified diff body: two-space context, `-` removed, `+` added. */
export function lineDiff(before: string, after: string): string[] {
  const a = before.replace(/\n$/, "").split("\n");
  const b = after.replace(/\n$/, "").split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(`  ${a[i++]}`);
      j++;
    } else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) {
      out.push(`- ${a[i++]}`);
    } else {
      out.push(`+ ${b[j++]}`);
    }
  }
  return out;
}

/** The generated section: one heading and one diff per construct, as Markset source. */
export function editDemos(): string {
  const parts: string[] = [];
  for (const demo of DEMOS) {
    const { doc } = fromMarkset(demo.source);
    if (toMarkset(structuredClone(doc), demo.source) !== demo.source) {
      throw new Error(`the ${demo.construct} sample does not come back byte-identical unedited`);
    }
    demo.edit(doc);
    const saved = toMarkset(doc, demo.source);
    const diff = lineDiff(demo.source, saved);
    const removed = diff.filter((line) => line.startsWith("- ")).length;
    const added = diff.filter((line) => line.startsWith("+ ")).length;
    const kept = diff.length - removed - added;
    const count = (n: number, what: string) => `${n === 0 ? "No" : n} ${what}${n === 1 ? "" : "s"}`;
    parts.push(
      `### ${demo.construct}: ${demo.what.toLowerCase()}`,
      "",
      "````diff",
      ...diff,
      "````",
      "",
      `{.small .muted}\n${count(removed, "line")} removed, ${count(added, "line").replace(/^N/, "n")} added. The other ${kept} are byte for byte what the author wrote.`,
      "",
    );
  }
  return parts.join("\n").trimEnd();
}
