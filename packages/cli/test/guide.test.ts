/**
 * The authoring guide teaches agents what to write, so it has to be held to the
 * parser the way the playground palette is: every example parses clean, every
 * construct has a section, and every code, value and type it names is one the
 * parser knows. A guide that drifted would teach an agent to write documents
 * that fail the check it is told to run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Heading, Nodes, Root } from "mdast";
import {
  AttrCode,
  AttributeLineCode,
  BLOCK_DIRECTIVE_NAMES,
  ConstructCode,
  DirectiveCode,
  FrontmatterCode,
  parseDocument,
  StructureCode,
} from "@markset-lang/parser";
import { CHART_TYPES } from "../../parser/src/ast.ts";
import { guidePath, main } from "../src/main.ts";

const guide = await readFile(guidePath, "utf8");

function run(argv: string[]) {
  let out = "";
  let err = "";
  return main(argv, {
    stdout: (s) => {
      out += s;
    },
    stderr: (s) => {
      err += s;
    },
  }).then((code) => ({ code, out, err }));
}

/** The plain text of a node. */
function text(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as Nodes[]).map(text).join("");
  return "";
}

/** Every fenced example whose info string is `markdown`, the documents the guide shows an agent. */
function examples(): string[] {
  const { ast } = parseDocument(guide);
  const out: string[] = [];
  const walk = (node: Nodes) => {
    if (node.type === "code" && node.lang === "markdown") out.push(node.value);
    if ("children" in node) for (const child of node.children as Nodes[]) walk(child);
  };
  walk(ast as Root);
  return out;
}

/** The backticked values in the sentence of the guide that begins with `start`. */
function listed(start: string): string[] {
  const at = guide.indexOf(start);
  assert.notEqual(at, -1, `the guide has no sentence beginning "${start}"`);
  const sentence = guide.slice(at, guide.indexOf(".", at + start.length));
  return [...sentence.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

test("markset guide prints the guide, and -o writes it", async () => {
  const printed = await run(["guide"]);
  assert.equal(printed.code, 0, printed.err);
  assert.equal(printed.out, guide);
  const out = join(await mkdtemp(join(tmpdir(), "markset-guide-")), "MARKSET.md");
  assert.equal((await run(["guide", "-o", out])).code, 0);
  assert.equal(await readFile(out, "utf8"), guide);
});

test("the guide is itself a document the parser reads without a diagnostic", () => {
  assert.deepEqual(parseDocument(guide).diagnostics, []);
});

test("every example in the guide parses with no diagnostic at all, errors or warnings", () => {
  const all = examples();
  assert.ok(all.length >= 13, `only ${all.length} examples`);
  for (const example of all) assert.deepEqual(parseDocument(example).diagnostics, [], example);
});

test("the guide has a section for every construct in the vocabulary, and for nothing else", () => {
  const { ast } = parseDocument(guide);
  const children = (ast as Root).children;
  const start = children.findIndex((n) => n.type === "heading" && n.depth === 2 && text(n) === "The constructs");
  assert.notEqual(start, -1);
  const sections: string[] = [];
  for (const node of children.slice(start + 1)) {
    if (node.type !== "heading") continue;
    const heading = node as Heading;
    if (heading.depth <= 2) break;
    if (heading.depth === 3) sections.push(text(heading));
  }
  assert.deepEqual(sections.sort(), [...BLOCK_DIRECTIVE_NAMES, "callout"].sort());
  assert.match(guide, /There are eight\./);
  assert.equal(BLOCK_DIRECTIVE_NAMES.size + 1, 8, "the guide says eight; the vocabulary changed");
});

test("every diagnostic code the guide names is one the parser reports", () => {
  const known = new Set<string>(
    [AttrCode, AttributeLineCode, ConstructCode, DirectiveCode, FrontmatterCode, StructureCode].flatMap((codes) =>
      Object.values(codes),
    ),
  );
  const named = [...guide.matchAll(/`([A-Z]+(?:_[A-Z]+)+)`/g)].map((m) => m[1]);
  assert.ok(named.length >= 14);
  for (const code of named) assert.ok(known.has(code), `${code} is not a parser code`);
});

test("the values the guide lists are the ones the parser accepts", () => {
  const frontmatter = (token: string, value: string) => `---\nmarkset: 0\ntheme:\n  ${token}: ${value}\n---\n\nText.\n`;
  for (const [sentence, token] of [
    ["The presets are", "preset"],
    ["`density` is", "density"],
    ["`radius` is", "radius"],
  ] as const) {
    const values = listed(sentence).filter((value) => value !== token);
    assert.ok(values.length >= 3, sentence);
    for (const value of values) assert.deepEqual(parseDocument(frontmatter(token, value)).diagnostics, [], value);
  }
  for (const kind of listed("The types are")) {
    assert.deepEqual(parseDocument(`> [!${kind}]\n> Body.\n`).diagnostics, [], kind);
  }
  for (const tone of listed("`tone` is").filter((value) => value !== "tone")) {
    assert.deepEqual(parseDocument(`:::card{tone=${tone}}\nBody.\n:::\n`).diagnostics, [], tone);
  }
  const charts = listed("`chart` draws a table as a chart").filter((value) => value !== "chart");
  assert.deepEqual(charts.sort(), [...CHART_TYPES].sort());
});

test("the blocks the guide says need a blank line after a fence are the ones the parser warns about", () => {
  assert.match(guide, /A paragraph straight after an opening fence is fine\./);
  const codes = (source: string) => parseDocument(source).diagnostics.map((d) => d.code);
  assert.deepEqual(codes(":::card\nText.\n:::\n"), []);
  assert.deepEqual(codes(":::steps\n3. Three\n4. Four\n:::\n"), ["DEGRADATION_BLANK_LINE"]);
  assert.deepEqual(codes(":::card\n    indented code\n:::\n"), ["DEGRADATION_BLANK_LINE"]);
  assert.deepEqual(codes(":::card\nTitle\n=====\n:::\n"), ["DEGRADATION_BLANK_LINE"]);
});
