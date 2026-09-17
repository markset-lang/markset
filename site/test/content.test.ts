import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const dist = await mkdtemp(join(tmpdir(), "markset-content-"));
const pages = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

test("no page states a number about this repository that the repository does not agree with", async () => {
  // The home page said 361 conformance cases while the suite held 376, on the
  // page whose entire argument is that the cases exist and are counted. A
  // number written by hand is a number that goes stale, and this one went stale
  // on the most important page on the site.
  const files = (await readdir(join(root, "tests"))).filter((f) => f.endsWith(".json"));
  let cases = 0;
  for (const f of files) {
    cases += (JSON.parse(await readFile(join(root, "tests", f), "utf8")) as unknown[]).length;
  }

  const home = await readFile(join(dist, "index.html"), "utf8");
  const row = /Test cases<\/[a-z]+>\s*<[^>]*>(\d+)</u.exec(home) ?? /Test cases[^\d]*(\d+)/u.exec(home);
  assert.ok(row, "the home page no longer states a case count");
  assert.equal(Number(row[1]), cases, "the home page's case count is not the suite's");
});

test("every substitution the build promises actually happened", async () => {
  // A token that survives into output is worse than a stale number: it is
  // visibly broken. Cheap to check, and it covers every page rather than the
  // one that happens to use the mechanism today.
  for (const page of pages) {
    const html = await readFile(join(dist, page), "utf8");
    const left = /\{\{[a-z-]+\}\}/iu.exec(html);
    assert.equal(left, null, `${page} still contains ${left?.[0]}`);
  }
});
