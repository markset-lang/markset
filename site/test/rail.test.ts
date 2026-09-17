import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../build.ts";

const dist = await mkdtemp(join(tmpdir(), "markset-rail-"));
const pages = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

async function rail(page: string): Promise<string[]> {
  const html = await readFile(join(dist, page), "utf8");
  const aside = /<aside class="site-toc">([\s\S]*?)<\/aside>/u.exec(html);
  if (!aside) return [];
  return [...aside[1].matchAll(/<a href="#[^"]*">([^<]*)<\/a>/gu)].map((m) => m[1]);
}

test("a rail appears on the pages long enough to want one, and nowhere else", async () => {
  // Named pages rather than the whole inventory. Listing every page that
  // qualifies makes this test a second place to edit whenever someone adds a
  // long document, which is a hand-kept list of exactly the kind the rule
  // exists to avoid -- and it broke within the hour, on an example added in
  // another session. These are the pages whose length is the point of them.
  for (const page of [
    "spec/index.html",
    "start/index.html",
    "github-pages/index.html",
    "reference/index.html",
    "reference/frontmatter/index.html",
    "examples/strategy-read/index.html",
  ]) {
    assert.ok((await rail(page)).length >= 5, `${page} is long enough to want a rail and has none`);
  }

  // And the rule's own consequence, over whatever the site happens to contain:
  // nothing gets a rail with less in it than the threshold.
  for (const page of pages) {
    const entries = await rail(page);
    if (entries.length > 0) {
      assert.ok(entries.length >= 5, `${page} has a rail listing only ${entries.length} sections`);
    }
  }
});

test("short pages get none, because a rail on a short page is clutter", async () => {
  for (const page of ["index.html", "cli/index.html", "reference/card/index.html", "examples/index.html"]) {
    assert.deepEqual(await rail(page), [], `${page} should have no rail`);
  }
  // Every conformance page is generated as constructs rather than sections, so
  // there is nothing for a rail to list. Worth pinning: it is not a threshold
  // that excludes them and no amount of tuning would include them.
  for (const page of pages.filter((p) => p.startsWith("conformance/"))) {
    assert.deepEqual(await rail(page), [], `${page} should have no rail`);
  }
});

test("the rail follows sections into layout, and stops at construct headings", async () => {
  // The strategy memo puts its sections inside `columns`, which is prose
  // layout. Reading only the tree's top level found one heading in the longest
  // document on the site; descending finds the sections a reader sees.
  const memo = await rail("examples/strategy-read/index.html");
  assert.ok(memo.length >= 10, `expected the memo's sections, found ${memo.length}`);

  // The construct tour wraps every top-level construct in a Result/Markdown
  // tabs pair, and a tab label is a heading. Those must not reach the rail, or
  // every page using tabs lists "Result" and "Markdown" among its sections.
  const tour = await rail("examples/showcase/index.html");
  assert.ok(tour.length > 0);
  for (const label of ["Result", "Markdown"]) {
    assert.ok(!tour.includes(label), `"${label}" is a tab label, not a section`);
  }
  // Same for a step's title and a grid item's heading.
  const guide = await rail("github-pages/index.html");
  for (const label of ["Write the stylesheet once", "Links are relative"]) {
    assert.ok(!guide.includes(label), `"${label}" belongs to a construct, not to the document`);
  }
});

test("the reference index lists its generated section too", async () => {
  // It is assembled from prose plus a generated listing. While that listing was
  // appended as HTML after the markdown, nothing that read the tree could see
  // it: the page measured short by eleven words and its last section was
  // missing from any rail built over it.
  const entries = await rail("reference/index.html");
  assert.ok(
    entries.includes("Beyond the constructs"),
    `generated section missing from the rail: ${entries.join(", ")}`,
  );
  assert.ok(entries.includes("The eight constructs"));
});
