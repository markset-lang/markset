import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { main } from "@markset/cli/src/main.ts";

const root = resolve(import.meta.dirname, "..", "..");
const guide = await readFile(join(root, "site", "content", "github-pages.md"), "utf8");

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

test("every markset command the Pages guide tells people to run exists", async () => {
  // The guide is a recipe someone will paste into a workflow. If a command in
  // it is renamed or dropped, their build breaks and nothing here would have
  // said so.
  const invoked = new Set([...guide.matchAll(/^\s*(?:node \S+\/)?markset(?:\.ts)? ([a-z]+)/gmu)].map((m) => m[1]));
  assert.ok(invoked.size >= 3, `expected several commands, found ${[...invoked].join(", ")}`);
  for (const command of invoked) {
    // Not --help: that short-circuits before the command is looked at, so it
    // would pass for a command that does not exist. Running it bare reaches
    // the dispatch, where an unknown name is reported as one.
    const { err } = await run([command]);
    assert.doesNotMatch(err, /unknown command/u, `markset ${command} is in the guide but not in the CLI`);
  }
  // And the guard on the guard: a name that is not a command must be caught.
  assert.match((await run(["definitelynotacommand"])).err, /unknown command/u);
});

test("the recipe in the guide actually produces a site", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-pages-recipe-"));
  try {
    await mkdir(join(dir, "docs"), { recursive: true });
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(
      join(dir, "docs", "guide.md"),
      "---\nmarkset: 0\n---\n\n# Guide\n\n:::grid{cols=2}\n- A\n- B\n:::\n",
    );

    // The two commands the guide's workflow runs, in the order it runs them.
    assert.equal((await run(["css", "-o", join(dir, "dist", "markset.css")])).code, 0);
    assert.equal(
      (
        await run([
          "html",
          join(dir, "docs", "guide.md"),
          "--css",
          "markset.css",
          "-o",
          join(dir, "dist", "guide.html"),
        ])
      ).code,
      0,
    );

    const page = await readFile(join(dir, "dist", "guide.html"), "utf8");
    const css = await readFile(join(dir, "dist", "markset.css"), "utf8");
    assert.match(page, /<link rel="stylesheet" href="markset\.css">/, "links the shared stylesheet");
    assert.doesNotMatch(page, /<style>/u, "and inlines nothing, which is the point of doing it this way");
    assert.match(page, /class="ms-grid"/u, "the construct rendered");
    assert.ok(css.length > 10_000, "the stylesheet is the real one");
    assert.ok(page.length < 2000, "a page is small once the stylesheet is shared");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the guide keeps the flag that stops a browser being downloaded into every build", () => {
  // --omit=dev is why a reader's Pages build does not pull Chromium for
  // mermaid, which is a dev dependency of this repository. The guide calls it
  // load-bearing; this is what keeps that claim true.
  assert.match(guide, /npm --prefix \.markset ci --omit=dev/u);
  assert.match(guide, /--omit=dev. is load-bearing/u, "and explains why, rather than just doing it");
});
