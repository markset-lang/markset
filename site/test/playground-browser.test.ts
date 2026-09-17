import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { build } from "../build.ts";

/**
 * The playground, in a real browser.
 *
 * Every other test on this site reads the HTML the build wrote, which is enough
 * for a page that was rendered at build time and is not enough for this one:
 * the playground ships a bundle and does its rendering on the reader's machine,
 * so "the page was written" says nothing about whether it works. A parser that
 * grew a node import, a bundler condition that stopped resolving to source, a
 * wiring mistake in the app -- none of those change the HTML, and all of them
 * leave a blank pane.
 *
 * The browser comes from mermaid-cli's puppeteer, which the site already
 * depends on for drawing mermaid fences. It is imported by name rather than
 * declared, so if that ever stops being true this reports a skip with a reason
 * instead of failing for a thing nobody changed.
 */
const puppeteer = await import("puppeteer").then(
  (m) => m.default,
  () => null,
);
const unavailable = puppeteer ? false : "puppeteer is not installed; it arrives with @mermaid-js/mermaid-cli";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

let dist = "";
let server: Server | undefined;
let origin = "";

if (!unavailable) {
  dist = await mkdtemp(join(tmpdir(), "markset-browser-"));
  await build(dist);
  server = createServer(async (request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await readFile(join(dist, path));
      response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
  const address = server.address();
  origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
}

after(async () => {
  server?.close();
  if (dist) await rm(dist, { recursive: true, force: true });
});

/** Open the playground and fail on anything the page reports going wrong. */
async function open(browser: Awaited<ReturnType<NonNullable<typeof puppeteer>["launch"]>>, hash = "") {
  const page = await browser.newPage();
  const problems: string[] = [];
  // The handlers take unknown, because puppeteer is imported dynamically and
  // its event map is not in scope here. Narrowing is the price of not declaring
  // a dependency this repository gets for free from mermaid-cli.
  page.on("pageerror", (error: unknown) => {
    problems.push(`uncaught: ${error instanceof Error ? error.message : String(error)}`);
  });
  page.on("requestfailed", (request: unknown) => {
    const url = (request as { url?: () => string }).url?.() ?? "unknown";
    problems.push(`failed request: ${url}`);
  });
  await page.goto(`${origin}/playground/${hash}`, { waitUntil: "networkidle0" });
  // The app sets this only after the stylesheet has arrived and the first
  // render has finished, so waiting on it waits for the whole path.
  await page.waitForSelector("body[data-playground-ready=true]", { timeout: 20_000 });
  return { page, problems };
}

test("the playground renders a document in a browser", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    const seen = await page.evaluate(() => {
      const frame = document.getElementById("pg-result") as HTMLIFrameElement;
      const srcdoc = frame.getAttribute("srcdoc") ?? "";
      return {
        srcdoc,
        sandbox: frame.getAttribute("sandbox"),
        html: (document.getElementById("pg-html-code") as HTMLElement).textContent ?? "",
        markdown: (document.getElementById("pg-markdown-code") as HTMLElement).textContent ?? "",
        ast: JSON.parse((document.getElementById("pg-ast-code") as HTMLElement).textContent ?? "null"),
        status: (document.getElementById("pg-status") as HTMLElement).textContent,
        samples: [...document.querySelectorAll("#pg-sample option")].length,
      };
    });
    assert.deepEqual(problems, []);

    // The renderer really ran: these classes exist nowhere in the page's own
    // markup, so they can only have come from a parse and a render.
    for (const cls of ["ms-document", "ms-callout", "ms-metrics", "ms-grid"]) {
      assert.match(seen.srcdoc, new RegExp(cls), `the preview is missing ${cls}`);
    }
    // §10/§11's obligation, and invariant 4, as a property of the page: the
    // preview frame is restricted to nothing at all -- an empty sandbox
    // attribute is the most restrictive value -- and the document renders in
    // full regardless, because there was never a script in it to run.
    assert.equal(seen.sandbox, "", "the preview frame must be sandboxed with nothing allowed");
    assert.doesNotMatch(seen.srcdoc, /<script/u, "a rendered Markset document carries no script");

    assert.match(seen.html, /^<h1 id="tidewater">/u);
    assert.match(seen.markdown, /^---\nmarkset: 0/u, "the downgrade keeps the frontmatter");
    assert.doesNotMatch(seen.markdown, /:::/u, "the downgrade has no directives left in it");
    assert.equal(seen.ast.type, "root");
    assert.equal(seen.status, "No problems");
    assert.ok(seen.samples >= 4, `only ${seen.samples} starter documents offered`);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("an invalid document reports problems and still renders", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    await page.select("#pg-sample", "invalid");
    await page.waitForFunction(() => (document.getElementById("pg-problems-count") as HTMLElement).textContent !== "");
    const seen = await page.evaluate(() => ({
      count: (document.getElementById("pg-problems-count") as HTMLElement).textContent,
      rows: [...document.querySelectorAll(".pg-problems li")].map((li) => ({
        severity: (li as HTMLElement).dataset.severity,
        text: (li.textContent ?? "").replace(/\s+/gu, " ").trim(),
      })),
      // Reporting an error is not a reason to stop showing the document. A
      // reader fixing an unclosed fence needs to see what the rest looks like.
      preview: document.getElementById("pg-result")?.getAttribute("srcdoc") ?? "",
    }));
    assert.deepEqual(problems, []);
    assert.equal(seen.count, "2");
    assert.equal(seen.rows[0].severity, "error");
    assert.match(seen.rows[0].text, /^11:4 error DIRECTIVE_UNKNOWN_NAME/u, "position, severity, then code");
    assert.equal(seen.rows[1].severity, "warning");
    assert.match(seen.preview, /ms-document/u, "an invalid document still renders");
    await page.close();
  } finally {
    await browser.close();
  }
});

test("the output tabs switch, by pointer and by arrow key", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    const selected = async () =>
      page.evaluate(() => {
        const tab = document.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
        const panel = document.getElementById(tab?.getAttribute("aria-controls") ?? "");
        return { tab: tab?.textContent?.trim(), panelHidden: panel?.hasAttribute("hidden") };
      });
    assert.deepEqual(await selected(), { tab: "Result", panelHidden: false });

    await page.click("#pg-tab-markdown");
    assert.deepEqual(await selected(), { tab: "Markdown", panelHidden: false });
    assert.equal(
      await page.evaluate(() => document.getElementById("pg-panel-result")?.hasAttribute("hidden")),
      true,
      "the panel left behind is hidden",
    );

    // Arrow keys move the selection, which is the half of the pattern that the
    // roles promise and that the tabs construct deliberately does not claim.
    await page.focus("#pg-tab-markdown");
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await selected(), { tab: "AST", panelHidden: false });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await selected(), { tab: "HTML", panelHidden: false });
    assert.deepEqual(problems, []);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("a shared link opens the document it was made from", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { encodeDocument } = await import("../playground/diagnostics.ts");
    const shared = "---\nmarkset: 0\n---\n\n# Sent to me\n\n> [!TIP]\n> Non-ASCII survives: ┌─┐ ∑ 🎛\n";
    const { page, problems } = await open(browser, `#${encodeDocument(shared)}`);
    const seen = await page.evaluate(() => ({
      source: (document.getElementById("pg-source") as HTMLTextAreaElement).value,
      preview: document.getElementById("pg-result")?.getAttribute("srcdoc") ?? "",
    }));
    assert.deepEqual(problems, []);
    assert.equal(seen.source, shared, "the document arrived byte for byte");
    assert.match(seen.preview, /Sent to me/u);
    assert.match(seen.preview, /ms-callout/u);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("the preview follows the reader's color scheme", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    // The frame is a separate document, so the control in the bar cannot reach
    // into it and the app has to re-render. §6 puts the switch on <body>.
    // Driven through the radio rather than through a pointer, because the
    // control collapses to the current option until it is hovered or focused
    // and its own test covers that. What is under test here is the rest of the
    // chain: the input changes, the shell's script writes data-scheme, and the
    // playground notices and re-renders a document it cannot reach into.
    await page.evaluate(() => (document.getElementById("ms-scheme-dark") as HTMLElement).click());
    await page.waitForFunction(() =>
      (document.getElementById("pg-result")?.getAttribute("srcdoc") ?? "").includes('data-scheme="dark"'),
    );
    await page.evaluate(() => (document.getElementById("ms-scheme-light") as HTMLElement).click());
    await page.waitForFunction(() =>
      (document.getElementById("pg-result")?.getAttribute("srcdoc") ?? "").includes('data-scheme="light"'),
    );
    assert.deepEqual(problems, []);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("every palette button inserts something the document accepts", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    // Start from nothing, then click every chip in the bar in turn. After each
    // one the document has to still be free of errors -- which is the whole
    // promise of a palette built from the closed vocabulary and the conformance
    // cases, checked end to end rather than inferred from the two halves.
    await page.evaluate(() => {
      const editor = document.getElementById("pg-source") as HTMLTextAreaElement;
      editor.value = "";
      editor.dispatchEvent(new Event("input"));
    });
    const ids: string[] = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".pg-insert [data-insert]")].map((b) => b.dataset.insert ?? ""),
    );
    assert.ok(ids.length >= 13, `the bar offers only ${ids.length} entries`);
    for (const id of ids) {
      await page.click(`.pg-insert [data-insert="${id}"]`);
      await page.waitForFunction(
        (name: string) => (document.getElementById("pg-status") as HTMLElement).textContent?.includes(name),
        {},
        id,
      );
      const count = await page.evaluate(
        () => (document.getElementById("pg-problems-count") as HTMLElement).textContent,
      );
      assert.equal(count, "", `inserting ${id} left a problem behind`);
    }
    const seen = await page.evaluate(() => ({
      source: (document.getElementById("pg-source") as HTMLTextAreaElement).value,
      preview: document.getElementById("pg-result")?.getAttribute("srcdoc") ?? "",
    }));
    assert.deepEqual(problems, []);
    // Frontmatter was clicked last and still belongs at the top (§6).
    assert.match(seen.source, /^---\nmarkset: 0\n/u, "frontmatter goes to the top whenever it is added");
    for (const cls of [
      "ms-callout",
      "ms-card",
      "ms-grid",
      "ms-columns",
      "ms-tabs",
      "ms-steps",
      "ms-metrics",
      "ms-figure",
    ]) {
      assert.match(seen.preview, new RegExp(cls), `the assembled document is missing ${cls}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
});

test("the bar and the vocabulary tab offer the same entries", { skip: unavailable }, async () => {
  const browser = await puppeteer!.launch({ headless: true });
  try {
    const { page, problems } = await open(browser);
    const seen = await page.evaluate(() => {
      const ids = (selector: string) =>
        [...document.querySelectorAll<HTMLElement>(selector)].map((b) => b.dataset.insert ?? "");
      return {
        bar: ids(".pg-insert [data-insert]"),
        tab: ids("#pg-vocab [data-insert]"),
        // One copy of each snippet, read out of the page by both.
        snippets: [...document.querySelectorAll("#pg-vocab .pg-vocab-entry pre code")].length,
        references: [...document.querySelectorAll("#pg-vocab .pg-vocab-actions a")].length,
      };
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(seen.bar, seen.tab, "a chip with no entry has no snippet to insert");
    assert.equal(seen.snippets, seen.bar.length, "every entry shows its source");
    assert.equal(seen.references, seen.bar.length, "every entry links to its reference page");
    await page.close();
  } finally {
    await browser.close();
  }
});
