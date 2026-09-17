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

/**
 * The page's own contents, not the whole rail. The rail carries two blocks now
 * — the section a page sits in, and what is on the page — and matching the
 * aside counts sibling pages as though they were sections of this one, which
 * every assertion below would then pass for the wrong reason.
 */
async function rail(page: string): Promise<string[]> {
  const html = await readFile(join(dist, page), "utf8");
  const contents = /<nav aria-label="Contents">([\s\S]*?)<\/nav>/u.exec(html);
  if (!contents) return [];
  return [...contents[1].matchAll(/<a href="#[^"]*">([^<]*)<\/a>/gu)].map((m) => m[1]);
}

/** The sibling pages offered in the rail, as hrefs. */
async function section(page: string): Promise<string[]> {
  const html = await readFile(join(dist, page), "utf8");
  const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/u.exec(html);
  if (!nav) return [];
  return [...nav[1].matchAll(/<a href="([^"]*)"/gu)].map((m) => m[1]);
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

test("a page reachable only from a sentence gets a place in the rail", async () => {
  // The Pages guide was the one genuine orphan on the site: a top-level guide
  // belonging to no section, linked from three paragraphs and nowhere else. It
  // is a peer of the adoption page in the rail now, and both say so from the
  // other's page.
  const fromStart = await section("start/index.html");
  assert.ok(
    fromStart.some((h) => h.endsWith("github-pages/index.html")),
    `the Pages guide is missing from the adoption page's rail: ${fromStart.join(", ")}`,
  );
  const fromGuide = await section("github-pages/index.html");
  assert.ok(fromGuide.some((h) => h.endsWith("start/index.html")));

  // And the short pages, which have no contents of their own, are no longer
  // dead ends: a reference page had no route to its siblings but the back
  // button.
  const card = await section("reference/card/index.html");
  assert.deepEqual(await rail("reference/card/index.html"), [], "still no table of contents, correctly");
  assert.ok(card.length >= 10, `a reference page should offer its siblings, found ${card.length}`);
  assert.ok(card.some((h) => h.endsWith("reference/grid/index.html")));
});

test("the rail says which page you are on, exactly once", async () => {
  for (const page of ["start/index.html", "github-pages/index.html", "reference/card/index.html"]) {
    const html = await readFile(join(dist, page), "utf8");
    const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/u.exec(html);
    assert.ok(nav, `${page} has no section rail`);
    const current = [...nav[1].matchAll(/aria-current="page"/gu)];
    assert.equal(current.length, 1, `${page} marks ${current.length} rail entries as current`);
  }
});
