// Runs inside a fresh project that installed the published packages the way a
// user would, so every import here resolves through node_modules to dist/ --
// never to this repository's TypeScript sources. Plain JavaScript on purpose:
// it is what a consumer writes, and it needs nothing compiled.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const checked = [];
const check = (name, run) => {
  run();
  checked.push(name);
};

const source = ":::card[Pricing]{tone=info}\nStarts at _$9_ a month.\n\n* One seat\n:::\n\n:::grid\n- a\n- b\n:::\n";

const parser = await import("@markset-lang/parser");
check("parser", () => {
  const { ast, diagnostics } = parser.parseDocument(source);
  assert.deepEqual(diagnostics, []);
  assert.equal(ast.children[0].type, "card");
  assert.equal(parser.serializeDocument(structuredClone(ast), { original: { source, ast } }), source);
});

const html = await import("@markset-lang/render-html");
check("render-html", () => {
  assert.match(html.renderHtml(parser.parseDocument(source).ast), /class="ms-card"/);
  assert.ok(existsSync(require.resolve("@markset-lang/render-html/css/markset.css")));
});

const down = await import("@markset-lang/render-downgrade");
check("render-downgrade", () => {
  assert.match(down.downgrade(source).markdown, /^# Pricing$/m);
});

const ascii = await import("@markset-lang/diagram-ascii");
check("diagram-ascii", () => {
  assert.match(ascii.drawAscii("+---+\n| a |\n+---+") ?? "", /<svg/);
});

const charts = await import("@markset-lang/chart-table");
check("chart-table", () => {
  const drawn = charts.chart("line", { categories: ["Q1", "Q2"], series: [{ name: "A", values: [1, 2] }] });
  assert.ok(drawn, "a chart was drawn");
});

const suite = await import("@markset-lang/conformance-suite");
check("conformance-suite", () => {
  const cases = suite.loadCases();
  assert.ok(cases.length > 300, `${cases.length} cases`);
  const failing = cases
    .filter((c) => c.markset.includes("\n"))
    .filter((c) => {
      const valid = !parser.parseDocument(c.markset).diagnostics.some((d) => d.severity === "error");
      return (
        c.section !== "attribute-specifier" &&
        c.section !== "block-directive" &&
        c.section !== "separator-directive" &&
        valid !== c.valid
      );
    });
  assert.deepEqual(
    failing.map((c) => `${c.section}: ${c.name}`),
    [],
  );
});

const { unified } = await import("unified");
const remarkParse = (await import("remark-parse")).default;
const remarkMarkset = (await import("@markset-lang/remark-markset")).default;
check("remark-markset", () => {
  const tree = unified()
    .use(remarkParse)
    .use(remarkMarkset)
    .runSync(unified().use(remarkParse).use(remarkMarkset).parse(source));
  assert.equal(tree.children[0].type, "card");
});

check("cli", () => {
  writeFileSync("doc.md", source);
  execFileSync("npx", ["--no-install", "markset", "check", "doc.md"], { stdio: "pipe" });
  assert.match(execFileSync("npx", ["--no-install", "markset", "html", "doc.md"], { encoding: "utf8" }), /ms-card/);
});

const tiptap = await import("@markset-lang/tiptap");
const { getSchema } = await import("@tiptap/core");
check("tiptap", () => {
  const { doc } = tiptap.fromMarkset(source);
  getSchema([tiptap.Markset]).nodeFromJSON(doc).check();
  assert.equal(tiptap.toMarkset(structuredClone(doc), source), source);
  doc.content[0].content[1].content[0].text = "From ";
  assert.equal(tiptap.toMarkset(doc, source), source.replace("Starts at ", "From "));
  assert.ok(existsSync(require.resolve("@markset-lang/tiptap/css/editor.css")));
});

const react = await import("@markset-lang/tiptap/react");
check("tiptap/react", () => {
  assert.equal(typeof react.reactNodeViews, "function");
});

console.log(`consumer: ${checked.length} entry points work from an install: ${checked.join(", ")}`);
