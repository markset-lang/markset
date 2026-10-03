import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Nodes, Root } from "mdast";
import { parseDocument, serializeDocument, stringifyAttributes } from "../src/index.ts";
import { patchDocument } from "../src/serialize.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const LINE_SECTIONS = new Set(["attribute-specifier", "block-directive", "separator-directive"]);

interface Doc {
  name: string;
  source: string;
}

/** Every full document in the suite, every example and the corpus. Line-grammar fragments are not documents. */
function documents(): Doc[] {
  const docs: Doc[] = [];
  for (const file of readdirSync(`${repo}tests`).sort()) {
    const cases = JSON.parse(readFileSync(`${repo}tests/${file}`, "utf8")) as Array<{
      section: string;
      name?: string;
      markset: string;
    }>;
    cases.forEach((c, i) => {
      if (LINE_SECTIONS.has(c.section) && !c.markset.includes("\n")) return;
      docs.push({ name: `${file} #${i}${c.name ? ` ${c.name}` : ""}`, source: c.markset });
    });
  }
  // test/corpus holds documents retired from the site's gallery, which are still real documents worth checking.
  for (const dir of ["examples", "test/corpus"]) {
    for (const file of readdirSync(`${repo}${dir}`).sort()) {
      if (file.endsWith(".md")) docs.push({ name: file, source: readFileSync(`${repo}${dir}/${file}`, "utf8") });
    }
  }
  return docs;
}

const withoutPositions = (tree: unknown): unknown =>
  JSON.parse(JSON.stringify(tree, (name, value) => (name === "position" ? undefined : value)));

function patch(source: string, edit: (tree: Root) => void): string {
  const { ast } = parseDocument(source);
  const tree = structuredClone(ast);
  edit(tree);
  const output = serializeDocument(tree, { original: { source, ast } });
  assert.deepEqual(
    withoutPositions(parseDocument(output).ast),
    withoutPositions(tree),
    "the output parses to the edited tree",
  );
  return output;
}

/** Lines removed from `before` and added in `after`, by longest common subsequence. */
function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      added.push(b[j++]);
    } else {
      removed.push(a[i++]);
    }
  }
  return { removed, added };
}

// ---------------------------------------------------------------------------
// Unchanged means identical

test("an unedited tree gives back the original bytes, for every document in the suite and every example", () => {
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    // A copy, so equality is structural rather than by object identity, as it is for a tree an editor rebuilt.
    assert.equal(serializeDocument(structuredClone(ast), { original: { source, ast } }), source, name);
  }
});

test("the node-by-node patch alone reproduces every document when nothing changed below the root", () => {
  // serializeDocument short-circuits an unchanged tree, so this drives the patch
  // itself: an unchanged root forced through it must still come back whole.
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    if (ast.children.length === 0) continue;
    const tree = structuredClone(ast);
    (tree as Root & { forced?: boolean }).forced = true;
    const output = patchDocument(tree, { source, ast });
    assert.equal(output, source, name);
  }
});

// ---------------------------------------------------------------------------
// Canonical form

test("every document serializes without an original to source that parses back to the same tree", () => {
  for (const { name, source } of documents()) {
    const { ast } = parseDocument(source);
    const canonical = serializeDocument(ast);
    assert.deepEqual(withoutPositions(parseDocument(canonical).ast), withoutPositions(ast), name);
    assert.equal(
      serializeDocument(parseDocument(canonical).ast),
      canonical,
      `${name}: the canonical form is a fixed point`,
    );
  }
});

test("the canonical form of a clean document is clean", () => {
  for (const { name, source } of documents()) {
    const { ast, diagnostics } = parseDocument(source);
    if (diagnostics.length > 0) continue;
    assert.deepEqual(parseDocument(serializeDocument(ast)).diagnostics, [], name);
  }
});

test("the canonical form uses the §3 serialization choices and writes defaults as nothing", () => {
  const source = [
    ":::card[Title]{tone=neutral compact=false}",
    "Some _emphasis_ and __strong__.",
    "",
    "* one",
    "* two",
    ":::",
    "",
  ].join("\n");
  assert.equal(
    serializeDocument(parseDocument(source).ast),
    [":::card[Title]", "Some *emphasis* and **strong**.", "", "- one", "- two", ":::", ""].join("\n"),
  );
});

test("an ordered list not starting at 1 gets a blank line after the fence, so it cannot merge into it (§3)", () => {
  const output = serializeDocument(parseDocument(":::steps\n\n3. a\n4. b\n:::\n").ast);
  assert.equal(output, ":::steps\n\n3. a\n4. b\n:::\n");
  assert.deepEqual(parseDocument(output).diagnostics, []);
});

test("an outer fence is always longer than any fence line inside it", () => {
  const card = (children: unknown[]) => ({
    type: "card",
    title: null,
    tone: "neutral",
    compact: false,
    id: null,
    classes: [],
    children,
  });
  const tree = {
    type: "root",
    children: [card([card([{ type: "code", lang: null, meta: null, value: ":::::" }])])],
  } as Root;
  const output = serializeDocument(tree);
  assert.equal(output, ":::::::card\n::::::card\n```\n:::::\n```\n::::::\n:::::::\n");
});

test("a rewritten row of a padded table is padded to the same columns", () => {
  const source = "| Metric  | Value |\n|---------|-------|\n| Revenue | $4.2M |\n| Churn   | 2.1%  |\n";
  const output = patch(source, (tree) => {
    const table = tree.children[0] as unknown as {
      children: Array<{ children: Array<{ children: Array<{ value: string }> }> }>;
    };
    table.children[2].children[1].children[0].value = "3%";
  });
  assert.equal(output, "| Metric  | Value |\n|---------|-------|\n| Revenue | $4.2M |\n| Churn   | 3%    |\n");
});

test("text that would open a construct is escaped", () => {
  const tree: Root = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: ":::card" }] },
      { type: "paragraph", children: [{ type: "text", value: "{.lead}" }] },
      { type: "paragraph", children: [{ type: "text", value: "[x]{.badge}" }] },
      { type: "paragraph", children: [{ type: "text", value: "::col" }] },
    ],
  };
  const output = serializeDocument(tree);
  assert.deepEqual(withoutPositions(parseDocument(output).ast), tree, output);
});

test("attribute values are quoted only when the grammar needs it", () => {
  assert.equal(
    stringifyAttributes({ id: "a", classes: ["b", "c"], attrs: { k: "v", ratio: "2:1", q: 'say "hi" \\ bye', e: "" } }),
    '{#a .b .c k=v ratio=2:1 q="say \\"hi\\" \\\\ bye" e=""}',
  );
  assert.throws(() => stringifyAttributes({ id: "1a", classes: [], attrs: {} }), /identifier/);
  assert.throws(() => stringifyAttributes({ id: null, classes: [], attrs: { k: "a\nb" } }), /span lines/);
});

test("a tree that no source can express is an error, not a wrong file", () => {
  const tree = parseDocument(":::columns\nA\n\n::col\n\nB\n:::\n").ast;
  const columns = tree.children[0] as unknown as { children: Array<{ id: string | null }> };
  columns.children[0].id = "first";
  assert.throws(() => serializeDocument(tree), /first column/);
});

// ---------------------------------------------------------------------------
// An edit touches only its own lines

/** Every text node, with the nearest block that has a position: the lines an edit to that text may touch. */
function textNodes(tree: Root): Array<{ path: Array<string | number>; lines: [number, number] }> {
  const found: Array<{ path: Array<string | number>; lines: [number, number] }> = [];
  const lists = ["children", "title", "label", "argument", "caption"];
  const inline = new Set(["text", "emphasis", "strong", "link", "linkReference", "span", "inlineCode", "delete"]);
  (function walk(node: Nodes, path: Array<string | number>, lines: [number, number]): void {
    const here: [number, number] =
      node.position && !inline.has(node.type) ? [node.position.start.line, node.position.end.line] : lines;
    for (const name of lists) {
      const list = (node as unknown as Record<string, unknown>)[name];
      if (!Array.isArray(list)) continue;
      list.forEach((child: Nodes, i) => {
        if (child.type === "text") found.push({ path: [...path, name, i], lines: here });
        walk(child, [...path, name, i], here);
      });
    }
  })(tree, [], [0, 0]);
  return found;
}

test("editing any text changes only the lines of the block holding it, in every example and clean case", () => {
  let edits = 0;
  for (const { name, source } of documents()) {
    const { ast, diagnostics } = parseDocument(source);
    // A document carrying warnings may be repaired where it is written out, such as an unclosed fence gaining its close.
    if (diagnostics.length > 0) continue;
    const before = source.split("\n");
    // Evenly spaced, at most 40 a document: the long examples would otherwise take most of the suite's time.
    const all = textNodes(ast);
    const stride = Math.max(1, Math.ceil(all.length / 40));
    for (const { path, lines } of all.filter((_, i) => i % stride === 0)) {
      const tree = structuredClone(ast);
      const text = path.reduce<unknown>((node, step) => (node as Record<string, unknown>)[step], tree) as {
        value: string;
      };
      text.value += " edited";
      const output = serializeDocument(tree, { original: { source, ast } });
      const after = output.split("\n");
      const where = `${name} at ${path.join(".")}`;
      assert.equal(after.length, before.length, `${where}: line count`);
      const changed = before.flatMap((line, i) => (line === after[i] ? [] : [i + 1]));
      assert.ok(changed.length > 0, `${where}: the edit is in the output`);
      for (const line of changed) {
        assert.ok(
          line >= lines[0] && line <= lines[1],
          `${where}: line ${line} changed, outside ${lines[0]}-${lines[1]}`,
        );
      }
      edits++;
    }
  }
  assert.ok(edits > 500, `${edits} edits`);
});

// One structural edit per construct. Each asserts the exact lines that differ.

const DOCUMENT = `---
markset: 0
title: Fixture
---

# Fixture

{.lead}
An _opening_ paragraph with a [badge]{.badge} in it.

> [!NOTE] Heads up
> The body of the callout.
>
> A second paragraph.

:::card[Pricing]{tone=info}
Card body, with __strong__ text.

* one
* two
:::

:::grid{cols=3}
- **Fast**
- **Small**
- **Typed**
:::

::::columns{ratio="2:1"}
Main column.

::col

Side column.
::::

:::tabs
### macOS
\`brew install markset\`

### Windows
\`winget install markset\`
:::

:::steps
1. Install.
2. Run.
:::

:::metrics
| Metric | Value | Δ |
|---|---|---|
| Revenue | $4.2M | +12% |
| Churn | 2.1% | -0.4% |
:::

:::figure[Lifecycle]{#fig-a width=60%}
![](lifecycle.svg)
:::

Closing paragraph.
`;

type Any = Record<string, unknown> & { children: Any[] };
const at = (tree: Root, type: string): Any => tree.children.find((node) => node.type === type) as unknown as Any;

const CASES: Array<{ name: string; edit: (tree: Root) => void; removed: string[]; added: string[] }> = [
  {
    name: "card: change the tone",
    edit: (tree) => {
      at(tree, "card").tone = "warn";
    },
    removed: [":::card[Pricing]{tone=info}"],
    added: [":::card[Pricing]{tone=warn}"],
  },
  {
    name: "card: add a list item",
    edit: (tree) => {
      const list = at(tree, "card").children[1];
      list.children.push(structuredClone(list.children[1]));
      (list.children[2].children[0].children[0] as unknown as { value: string }).value = "three";
    },
    removed: [],
    added: ["* three"],
  },
  {
    name: "callout: change the kind",
    edit: (tree) => {
      at(tree, "callout").kind = "WARNING";
    },
    removed: ["> [!NOTE] Heads up"],
    added: ["> [!WARNING] Heads up"],
  },
  {
    name: "callout: remove the second paragraph",
    edit: (tree) => {
      at(tree, "callout").children.pop();
    },
    removed: [">", "> A second paragraph."],
    added: [],
  },
  {
    name: "grid: add an item",
    edit: (tree) => {
      const list = at(tree, "grid").children[0];
      list.children.push(structuredClone(list.children[0]));
    },
    removed: [],
    added: ["- **Fast**"],
  },
  {
    name: "grid: change the column count",
    edit: (tree) => {
      at(tree, "grid").cols = 4;
    },
    removed: [":::grid{cols=3}"],
    added: [":::grid{cols=4}"],
  },
  {
    name: "columns: change the ratio",
    edit: (tree) => {
      at(tree, "columns").ratio = [1, 1];
    },
    removed: ['::::columns{ratio="2:1"}'],
    added: ["::::columns{ratio=1:1}"],
  },
  {
    name: "columns: give the second column a class",
    edit: (tree) => {
      at(tree, "columns").children[1].classes = ["aside"];
    },
    removed: ["::col"],
    added: ["::col{.aside}"],
  },
  {
    name: "tabs: remove a tab",
    edit: (tree) => {
      at(tree, "tabs").children.pop();
    },
    removed: ["", "### Windows", "`winget install markset`"],
    added: [],
  },
  {
    name: "tabs: rename a tab",
    edit: (tree) => {
      (at(tree, "tabs").children[0] as unknown as { label: Array<{ value: string }> }).label[0].value = "Mac";
    },
    removed: ["### macOS"],
    added: ["### Mac"],
  },
  {
    name: "steps: add a step",
    edit: (tree) => {
      const list = at(tree, "steps").children[0];
      const step = structuredClone(list.children[1]);
      (step.children[0].children[0] as unknown as { value: string }).value = "Ship.";
      list.children.push(step);
    },
    removed: [],
    added: ["3. Ship."],
  },
  {
    name: "metrics: edit a value",
    edit: (tree) => {
      const row = at(tree, "metrics").children[0].children[1];
      (row.children[1].children[0] as unknown as { value: string }).value = "$4.4M";
    },
    removed: ["| Revenue | $4.2M | +12% |"],
    added: ["| Revenue | $4.4M | +12% |"],
  },
  {
    name: "metrics: switch the direction",
    edit: (tree) => {
      at(tree, "metrics").direction = "inverse";
    },
    removed: [":::metrics"],
    added: [":::metrics{direction=inverse}"],
  },
  {
    name: "figure: change the caption",
    edit: (tree) => {
      (at(tree, "figure").caption as Array<{ value: string }>)[0].value = "Request lifecycle";
    },
    removed: [":::figure[Lifecycle]{#fig-a width=60%}"],
    added: [":::figure[Request lifecycle]{#fig-a width=60%}"],
  },
  {
    name: "span: change its class",
    edit: (tree) => {
      const paragraph = tree.children.find((node) => node.type === "paragraph" && node.attributes) as unknown as Any;
      (paragraph.children[3] as unknown as { attributes: { classes: string[] } }).attributes.classes = ["small"];
    },
    removed: ["An _opening_ paragraph with a [badge]{.badge} in it."],
    added: ["An _opening_ paragraph with a [badge]{.small} in it."],
  },
  {
    name: "attribute line: change the class",
    edit: (tree) => {
      const paragraph = tree.children.find((node) => node.type === "paragraph" && node.attributes) as unknown as Any;
      (paragraph.attributes as { classes: string[] }).classes = ["muted"];
    },
    removed: ["{.lead}"],
    added: ["{.muted}"],
  },
  {
    name: "remove a whole construct",
    edit: (tree) => {
      tree.children.splice(tree.children.indexOf(at(tree, "steps") as never), 1);
    },
    removed: [":::steps", "1. Install.", "2. Run.", ":::", ""],
    added: [],
  },
  {
    name: "insert a new construct",
    edit: (tree) => {
      const index = tree.children.indexOf(at(tree, "figure") as never);
      tree.children.splice(index, 0, {
        type: "card",
        title: null,
        tone: "success",
        compact: false,
        id: null,
        classes: [],
        children: [{ type: "paragraph", children: [{ type: "text", value: "New." }] }],
      });
    },
    removed: [],
    added: [":::card{tone=success}", "New.", ":::", ""],
  },
];

for (const { name, edit, removed, added } of CASES) {
  test(`structural edit, ${name}: only its lines differ`, () => {
    assert.deepEqual(lineDiff(DOCUMENT, patch(DOCUMENT, edit)), { removed, added });
  });
}

test("the fixture exercises every construct", () => {
  const types = new Set(parseDocument(DOCUMENT).ast.children.map((node) => node.type));
  for (const type of ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure", "yaml"]) {
    assert.ok(types.has(type as never), type);
  }
  assert.deepEqual(parseDocument(DOCUMENT).diagnostics, []);
});
