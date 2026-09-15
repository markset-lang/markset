import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, position } from "../src/main.ts";

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
  assert.equal(
    fragment.out,
    '<h1 id="title">Title</h1>\n<section class="ms-card" data-tone="neutral">\n<p>x</p>\n</section>\n',
  );

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

const DIAGRAM_DOC = ":::figure[A hub and its edges]\n```ascii\n+---+\n| a |\n+---+\n```\n:::\n";

async function diagramFile() {
  const dir = await mkdtemp(join(tmpdir(), "markset-diagram-"));
  const file = join(dir, "doc.md");
  await writeFile(file, DIAGRAM_DOC);
  return file;
}

test("html draws diagram fences only when asked", async () => {
  const file = await diagramFile();
  const plain = await run(["html", "--fragment", file]);
  assert.match(plain.out, /<pre><code class="language-ascii">/);

  const drawn = await run(["html", "--fragment", "--diagram", "ascii", file]);
  assert.equal(drawn.code, 0);
  assert.match(drawn.out, /<img class="ms-diagram" data-diagram="ascii"/);
  assert.match(drawn.out, /alt="A hub and its edges"/);
});

test("a language with no built-in drawer is refused rather than ignored", async () => {
  // Silently rendering a code block after being asked for a diagram would look
  // like the drawer ran and produced nothing.
  const file = await diagramFile();
  const { code, err } = await run(["html", "--fragment", "--diagram", "mermaid", file]);
  assert.equal(code, 2);
  assert.match(err, /no built-in drawer/);
  assert.match(err, /mermaid=<command>/, "and it says what to write instead");
});

test("a drawer command receives the fence on stdin and returns SVG on stdout", async () => {
  const file = await diagramFile();
  const command = `node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write('<svg xmlns=\\"http://www.w3.org/2000/svg\\" data-len=\\"'+s.trim().split('\\n').length+'\\"></svg>'))"`;
  const { code, out } = await run(["html", "--fragment", "--diagram", `ascii=${command}`, file]);
  assert.equal(code, 0);
  assert.match(out, /ms-diagram/);
  assert.match(decodeURIComponent(out), /data-len="3"/, "the command saw all three lines of the fence");
});

test("a drawer command that fails leaves the code block and says so", async () => {
  const file = await diagramFile();
  const { code, out, err } = await run(["html", "--fragment", "--diagram", "ascii=exit 7", file]);
  assert.equal(code, 0, "a failed diagram is not a failed render");
  assert.match(out, /<pre><code class="language-ascii">/);
  assert.match(err, /diagram ascii:.*exited 7/);
});

test("a document cannot name its own drawer", async () => {
  // The property that keeps invariant 4 intact: the mapping from info string to
  // command comes from the flag and nowhere else, so nothing in a Markset file
  // can cause anything to run.
  const dir = await mkdtemp(join(tmpdir(), "markset-diagram-"));
  const file = join(dir, "doc.md");
  const marker = join(dir, "ran");
  await writeFile(file, `:::figure[Hostile]\n\`\`\`ascii=touch ${marker}\n+-+\n\`\`\`\n:::\n`);
  const { code } = await run(["html", "--fragment", "--diagram", "ascii", file]);
  assert.equal(code, 0);
  await assert.rejects(readFile(marker), "the info string is not a command");
});
