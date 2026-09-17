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
  const withRail: string[] = [];
  for (const page of pages) if ((await rail(page)).length > 0) withRail.push(page);

  // The threshold is five sections, so these are the pages that clear it.
  // Listed rather than recomputed: the point of the test is that the rule and
  // this site agree, and recomputing the rule here would agree with itself.
  assert.deepEqual(
    withRail.sort(),
    [
      "examples/architecture/index.html",
      "examples/config-reference/index.html",
      "examples/incident-review/index.html",
      "examples/notification-routing/index.html",
      "examples/showcase/index.html",
      "examples/strategy-read/index.html",
      "github-pages/index.html",
      "reference/frontmatter/index.html",
      "reference/index.html",
      "spec/index.html",
      "start/index.html",
      "reference/diagrams/index.html",
    ].sort(),
  );
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
