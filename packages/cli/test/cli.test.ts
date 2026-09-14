import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, position } from "../src/main.ts";

function run(argv: string[]) {
  let out = "";
  let err = "";
  return main(argv, { stdout: (s) => { out += s; }, stderr: (s) => { err += s; } }).then((code) => ({ code, out, err }));
}

test("position converts offsets to 1-based line and column", () => {
  assert.deepEqual(position("ab\ncd\n", 0), { line: 1, column: 1 });
  assert.deepEqual(position("ab\ncd\n", 3), { line: 2, column: 1 });
  assert.deepEqual(position("ab\ncd\n", 4), { line: 2, column: 2 });
});

test("check reports diagnostics with positions and exits 1 on errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-cli-"));
  const file = join(dir, "doc.md");
  await writeFile(file, "# T\n\n:::grid\nnot a list\n:::\n\n:::card\nunclosed\n");
  const { code, out, err } = await run(["check", file]);
  assert.equal(code, 1);
  assert.match(out, /doc\.md:3:1: error GRID_CONTENT/);
  assert.match(out, /doc\.md:7:1: warning DIRECTIVE_UNCLOSED/);
  assert.match(err, /2 diagnostic\(s\), 1 error\(s\) in 1 file\(s\)/);

  const json = await run(["check", "--json", file]);
  const parsed = JSON.parse(json.out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].code, "GRID_CONTENT");
});

test("check exits 0 for a clean document", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-cli-"));
  const file = join(dir, "ok.md");
  await writeFile(file, "# Fine\n\n:::card[T]\nx\n:::\n");
  const { code, out } = await run(["check", file]);
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("html writes a full page by default and a fragment on request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-cli-"));
  const file = join(dir, "doc.md");
  const outFile = join(dir, "doc.html");
  await writeFile(file, "---\nmarkset: 0\ntheme:\n  preset: deck\n---\n\n# Title\n\n:::card\nx\n:::\n");
  const page = await run(["html", file, "-o", outFile]);
  assert.equal(page.code, 0);
  const written = await readFile(outFile, "utf8");
  assert.match(written, /^<!doctype html>/);
  assert.match(written, /<style>\n\/\* Markset default stylesheet/);
  assert.match(written, /<body data-preset="deck">/);
  assert.match(written, /<section class="ms-card" data-tone="neutral">/);

  const fragment = await run(["html", "--fragment", file]);
  assert.equal(fragment.out, '<h1>Title</h1>\n<section class="ms-card" data-tone="neutral">\n<p>x</p>\n</section>\n');

  const linked = await run(["html", "--css", "theme.css", file]);
  assert.match(linked.out, /<link rel="stylesheet" href="theme.css">/);
});

test("downgrade and ast commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-cli-"));
  const file = join(dir, "doc.md");
  await writeFile(file, ":::card[T]\nx [s]{.a}\n:::\n");
  const down = await run(["downgrade", file]);
  assert.equal(down.out, "# T\n\nx s\n");
  const ast = await run(["ast", file]);
  const tree = JSON.parse(ast.out);
  assert.equal(tree.children[0].type, "card");
  assert.equal("position" in tree.children[0], false);
  const withPositions = await run(["ast", "--positions", file]);
  assert.equal("position" in JSON.parse(withPositions.out).children[0], true);
});

test("usage errors", async () => {
  assert.equal((await run([])).code, 2);
  assert.equal((await run(["--help"])).code, 0);
  assert.equal((await run(["bogus", "x.md"])).code, 2);
  assert.equal((await run(["check"])).code, 2);
});
