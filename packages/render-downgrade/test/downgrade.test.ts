import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset-lang/parser";
import { downgrade, downgradeTree } from "../src/index.ts";

// Output strings are pinned in tests/*.json; these cover the transform's
// invariants rather than exact text.

test("plain CommonMark round-trips through the downgrade unchanged in structure", () => {
  const source =
    "# Title\n\nA paragraph with *emphasis* and `code`.\n\n- one\n- two\n\n> quote\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";
  const { markdown } = downgrade(source);
  const again = downgrade(markdown).markdown;
  assert.equal(again, markdown, "downgrade output is a fixed point");
  assert.equal(downgrade(source).diagnostics.length, 0);
});

test("downgrade output contains no Markset syntax", () => {
  const source = `${[
    "---",
    "markset: 0",
    "---",
    "# Doc",
    '::::columns{ratio="2:1"}',
    "Main [Beta]{.badge}.",
    "",
    "::col",
    "",
    ":::card[Side]{tone=info}",
    "> [!NOTE] Hi",
    "> body",
    ":::",
    "::::",
    ":::tabs",
    "### A",
    "a",
    "### B",
    "b",
    ":::",
    ":::figure[Cap]{width=50%}",
    "![](x.svg)",
    ":::",
  ].join("\n")}\n`;
  const { markdown } = downgrade(source);
  assert.doesNotMatch(markdown, /^:{2,}/m, "no fences or separators");
  assert.doesNotMatch(markdown, /\]\{/, "no span attributes");
  assert.doesNotMatch(markdown, /\[!/, "no callout markers");
  const reparsed = parseDocument(markdown);
  assert.deepEqual(reparsed.diagnostics, [], "downgraded output is itself a clean document");
  for (const type of ["directive", "card", "columns", "tabs", "figure", "callout", "span"]) {
    assert.ok(!JSON.stringify(reparsed.ast).includes(`"type":"${type}"`), `no ${type} nodes after downgrade`);
  }
});

test("card titles become headings one level below the current section", () => {
  const { ast } = parseDocument(
    "# H1\n\n:::card[A]\nx\n:::\n\n### H3\n\n::::card[B]\n:::card[C]\ny\n:::\n::::\n\n:::card[D]\n:::\n",
  );
  const depths = downgradeTree(ast)
    .children.filter((n) => n.type === "heading")
    .map((n) => n.depth);
  // H1, A(2), H3, B(4), C(5), D(6 → capped, since C set depth 5)
  assert.deepEqual(depths, [1, 2, 3, 4, 5, 6]);
});

test("a card title at depth six stays at six", () => {
  const { ast } = parseDocument("###### Deep\n\n:::card[T]\n:::\n");
  const depths = downgradeTree(ast)
    .children.filter((n) => n.type === "heading")
    .map((n) => n.depth);
  assert.deepEqual(depths, [6, 6]);
});

test("the input tree is not modified", () => {
  const { ast } = parseDocument(":::card[T]\nx [s]{.a}\n:::\n");
  const before = JSON.stringify(ast);
  downgradeTree(ast);
  assert.equal(JSON.stringify(ast), before);
});
