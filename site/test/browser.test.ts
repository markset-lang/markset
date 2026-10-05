/**
 * The built pages in Chromium, at a phone's width and a desktop's: nothing
 * scrolls sideways, nothing in the shell or the document is clipped, every link
 * is a usable target, and the keyboard reaches the skip link first. Ported from
 * intentset.org's site tests on 2026-10-05. Until then the only automated 390px
 * check here was the playground's, and every other page was measured by hand.
 *
 * Playwright's Chromium, which CI installs before the tests run. Anywhere it
 * cannot launch the tests skip with the reason, except under CI, where a skip
 * would be a check that silently stopped checking.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { type Browser, chromium } from "@playwright/test";
import { build } from "../build.ts";
import { contentType } from "../serve.ts";

const WIDTHS = [390, 1440];

const dist = await mkdtemp(join(tmpdir(), "markset-browser-"));
/**
 * Every page the build writes, measured, rather than a sample: all of them
 * pass, and a sample is a list somebody has to remember to extend. The
 * playground and the editing page are applications with browser tests of
 * their own, which wait for their scripts in a way this one does not.
 */
const PAGES = (await build(dist)).filter((page) => !/^(playground|tiptap)\//.test(page));
// Served over HTTP the way Pages serves it, 404.html included for any address
// it has nothing at, rather than opened from disk: the 404 page resolves its
// links from the site's root, which a file: URL does not have.
const server = createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(dist, path));
    response.writeHead(200, { "content-type": contentType(path) });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(await readFile(join(dist, "404.html")));
  }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
let browser: Browser | null = null;
let launchError = "";
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  launchError = (error as Error).message.split("\n")[0];
  if (process.env.CI) throw error;
}
after(async () => {
  await browser?.close();
  server.close();
  await rm(dist, { recursive: true, force: true });
});

const url = (page: string) => `${origin}/${page}`;

interface Measure {
  scrollWidth: number;
  outside: string[];
  smallLinks: string[];
}

async function measure(page: string, width: number): Promise<Measure> {
  const tab = await (browser as Browser).newPage({ viewport: { width, height: 900 } });
  try {
    await tab.goto(url(page));
    return await tab.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      // A wide table or code block becomes a scrolling block at phone width
      // (markset.css); its rows extend past the viewport by design and are
      // reached by scrolling the block, so what is measured is the container.
      const inScroller = (el: Element): boolean => {
        for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
          const overflow = getComputedStyle(n).overflowX;
          if ((overflow === "auto" || overflow === "scroll") && n.scrollWidth > n.clientWidth) return true;
        }
        return false;
      };
      const outside = [...document.querySelectorAll("header *, main *, footer *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left < -0.5 || r.right > innerWidth + 0.5) && !inScroller(el);
        })
        .map((el) => el.outerHTML.slice(0, 80));
      const smallLinks = [...document.querySelectorAll("a")]
        .filter((a) => !a.classList.contains("site-skip"))
        .filter((a) => {
          const r = a.getBoundingClientRect();
          return r.width > 0 && r.height < 24;
        })
        .map((a) => `${a.textContent?.trim()} (${Math.round(a.getBoundingClientRect().height)}px)`);
      return { scrollWidth, outside, smallLinks };
    });
  } finally {
    await tab.close();
  }
}

for (const width of WIDTHS) {
  test(`at ${width}px nothing scrolls sideways, nothing is clipped, and every link is at least 24px tall`, async (t) => {
    if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
    for (const page of PAGES) {
      const result = await measure(page, width);
      t.diagnostic(`${page} at ${width}px: scrollWidth ${result.scrollWidth}`);
      assert.ok(result.scrollWidth <= width, `${page}: scrolls sideways at ${width}px (${result.scrollWidth})`);
      assert.deepEqual(result.outside, [], `${page}: outside the viewport at ${width}px`);
      assert.deepEqual(result.smallLinks, [], `${page}: links under 24px at ${width}px`);
    }
  });
}

test("Tab from the top lands on the skip link, which moves focus to main; the next stop shows a focus ring", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of WIDTHS) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("index.html"));
    await tab.keyboard.press("Tab");
    const first = await tab.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        label: el.textContent?.trim(),
        visible: r.top >= 0 && r.height > 0,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
      };
    });
    assert.equal(first.label, "Skip to content", `at ${width}px`);
    assert.ok(first.visible, `the skip link is visible when focused at ${width}px`);
    assert.equal(first.outline, "solid 3px", `the skip link has a focus ring at ${width}px`);
    await tab.keyboard.press("Enter");
    assert.equal(await tab.evaluate(() => document.activeElement?.id), "main", `at ${width}px`);
    const mainOutline = await tab.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    assert.equal(mainOutline, "none", `main takes focus without outlining the page at ${width}px`);
    await tab.keyboard.press("Tab");
    const next = await tab.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { tag: el.tagName, inMain: !!el.closest("main"), outline: `${style.outlineStyle} ${style.outlineWidth}` };
    });
    assert.equal(next.tag, "A");
    assert.ok(next.inMain, `the next stop is inside the document at ${width}px`);
    assert.equal(next.outline, "solid 3px", `the first link after main has a focus ring at ${width}px`);
    await tab.close();
  }
});

test("the skip link is out of sight until it is focused", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const tab = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await tab.goto(url("index.html"));
  const bottom = await tab.evaluate(() => document.querySelector(".site-skip")?.getBoundingClientRect().bottom ?? 1);
  assert.ok(bottom <= 0, `the skip link shows at rest (bottom ${bottom}px)`);
  await tab.close();
});

test("the navigation wraps below the brand at phone width and sits beside it on a desktop", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const position = async (width: number) => {
    const tab = await (browser as Browser).newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("index.html"));
    const result = await tab.evaluate(() => {
      const brand = (document.querySelector(".site-brand") as Element).getBoundingClientRect();
      const nav = (document.querySelector(".site-nav") as Element).getBoundingClientRect();
      const columns = getComputedStyle(document.querySelector(".ms-columns.hero") as Element).gridTemplateColumns;
      return { navBelowBrand: nav.top >= brand.bottom - 1, columns: columns.split(" ").length };
    });
    await tab.close();
    return result;
  };
  const phone = await position(390);
  assert.ok(phone.navBelowBrand, "at 390px the nav wraps under the brand");
  assert.equal(phone.columns, 1, "at 390px the hero stacks");
  const desktop = await position(1440);
  assert.ok(!desktop.navBelowBrand, "at 1440px the nav sits beside the brand");
  assert.equal(desktop.columns, 2, "at 1440px the hero has two columns");
});

test("an address with nothing at it, however deep, gets the 404 page with its styles and working links", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const tab = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const failed: string[] = [];
  tab.on("requestfailed", (request) => failed.push(request.url()));
  tab.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("/no/such/")) failed.push(response.url());
  });
  const response = await tab.goto(`${origin}/no/such/page/`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 404);
  const result = await tab.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    styled: getComputedStyle(document.querySelector(".site-header") as Element).display,
    home: (document.querySelector(".site-brand") as HTMLAnchorElement).href,
  }));
  assert.equal(result.heading, "Page not found");
  assert.equal(result.styled, "flex", "the site's stylesheet loaded");
  assert.equal(result.home, `${origin}/index.html`, "the wordmark goes home from any depth");
  assert.deepEqual(failed, [], "every asset it asks for exists");
  await tab.close();
});
