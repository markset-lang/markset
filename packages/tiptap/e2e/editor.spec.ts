import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BUNDLE } from "./global-setup.ts";

const repo = join(import.meta.dirname, "..", "..", "..");
const css = ["packages/render-html/css/markset.css", "packages/tiptap/css/editor.css"]
  .map((file) => readFileSync(join(repo, file), "utf8"))
  .join("\n");

async function open(page: Page, source?: string): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body class="ms-document"><div id="editor"></div></body></html>`,
  );
  await page.addScriptTag({ path: BUNDLE });
  await page.waitForFunction(() => "harness" in window);
  if (source !== undefined) await page.evaluate((s) => window.harness.load(s), source);
  expect(errors).toEqual([]);
}

/** Put the caret at the end of the first element matching `selector`, through the browser's own selection. */
async function caretAtEnd(page: Page, selector: string): Promise<void> {
  const target = page.locator(`.ProseMirror ${selector}`).first();
  await target.click();
  await page.keyboard.press("End");
  await page.waitForFunction(() => window.harness.selectionSettled());
}

const save = (page: Page) => page.evaluate(() => window.harness.save());

/** Lines of `after` that are not lines of `before`, in order: what a reviewer sees highlighted. */
function newLines(before: string, after: string): string[] {
  const old = new Set(before.split("\n"));
  return after.split("\n").filter((line) => !old.has(line));
}

test("every suite document and example saves byte-identical after loading in this browser", async ({ page }) => {
  const documents: Array<{ name: string; source: string }> = [];
  for (const file of readdirSync(join(repo, "tests"))) {
    for (const [i, c] of (
      JSON.parse(readFileSync(join(repo, "tests", file), "utf8")) as Array<{ section: string; markset: string }>
    ).entries()) {
      if (c.markset.includes("\n")) documents.push({ name: `${file} #${i}`, source: c.markset });
    }
  }
  for (const dir of ["examples", join("test", "corpus")]) {
    for (const file of readdirSync(join(repo, dir)).filter((f) => f.endsWith(".md"))) {
      documents.push({ name: file, source: readFileSync(join(repo, dir, file), "utf8") });
    }
  }
  await open(page);
  expect(await page.evaluate((docs) => window.harness.roundTrip(docs), documents)).toEqual([]);
});

const CARD =
  ":::card[Pricing]{tone=info}\nStarts at _$9_ a month.\n\n* One seat\n* Two seats\n:::\n\nAfter the card.\n";

test("typing at the end of a paragraph changes that line and no other", async ({ page }) => {
  await open(page, CARD);
  await caretAtEnd(page, ".ms-card p");
  await page.keyboard.type(" Billed yearly.");
  expect(await save(page)).toBe(CARD.replace("a month.", "a month. Billed yearly."));
});

test("Enter in a list item makes a new item, and it saves as one new line", async ({ page }) => {
  await open(page, CARD);
  await caretAtEnd(page, ".ms-card li:last-child p");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Three seats");
  expect(await save(page)).toBe(CARD.replace("* Two seats\n", "* Two seats\n* Three seats\n"));
});

test("Tab nests a list item and Shift+Tab brings it back", async ({ page }) => {
  await open(page, CARD);
  await caretAtEnd(page, ".ms-card li:last-child p");
  await page.keyboard.press("Tab");
  expect(await save(page)).toContain("* One seat\n  * Two seats");
  await page.keyboard.press("Shift+Tab");
  expect(await save(page)).toBe(CARD);
});

test("the keyboard's bold and italic write Markset emphasis", async ({ page }) => {
  await open(page, "Plain text.\n");
  await caretAtEnd(page, "p");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" Bold");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.type(" slanted");
  expect(await save(page)).toBe("Plain text. **Bold** *slanted*\n");
});

test("Enter in a card's title moves into its body rather than splitting the title", async ({ page }) => {
  await open(page, CARD);
  await caretAtEnd(page, ".ms-card-title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Now ");
  expect(await save(page)).toBe(CARD.replace("Starts at", "Now Starts at"));
});

test("Shift+Enter is a hard line break", async ({ page }) => {
  await open(page, "One.\n");
  await caretAtEnd(page, "p");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Two.");
  const saved = await save(page);
  expect(saved).toMatch(/^One\.(\\| {2})\nTwo\.\n$/);
});

test("undo takes an edit back to the original bytes, and redo restores it", async ({ page }) => {
  await open(page, CARD);
  await caretAtEnd(page, ".ms-card p");
  await page.keyboard.type(" Edited.");
  const edited = await save(page);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await save(page)).toBe(CARD);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await save(page)).toBe(edited);
});

test("deleting everything leaves a document that still saves", async ({ page }) => {
  await open(page, CARD);
  await page.locator(".ProseMirror").click();
  // Select all through the editor rather than the platform's key: WebKit's
  // Linux build does not deliver Ctrl+A to the page under Playwright, so the
  // key tested the runner's platform and not the editor. Backspace is real.
  await page.evaluate(() => window.harness.selectAll());
  await page.keyboard.press("Backspace");
  const saved = await save(page);
  expect(saved.trim()).toBe("");
});

test("pasted HTML keeps its structure and saves as Markset", async ({ page }) => {
  await open(page, "Before.\n");
  await caretAtEnd(page, "p");
  await page.evaluate(() =>
    window.harness.pasteHTML("<p>Pasted <strong>bold</strong> and <em>slanted</em>.</p><ul><li><p>item</p></li></ul>"),
  );
  const saved = await save(page);
  expect(saved).toContain("Pasted **bold** and *slanted*.");
  expect(saved).toMatch(/^[-*] item$/m);
});

test("text copied from the editor pastes back as the same construct", async ({ page }) => {
  await open(page, CARD);
  const html = await page.evaluate(() => window.harness.copy("card"));
  await caretAtEnd(page, "p:last-of-type");
  await page.evaluate((h) => window.harness.pasteHTML(h), html);
  const saved = await save(page);
  expect(saved.match(/:::card\[Pricing\]\{tone=info\}/g)?.length).toBe(2);
});

for (const name of ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const) {
  test(`${name}: inserted at the caret, then removed, and the file is back where it was`, async ({ page }) => {
    const source = "First.\n\nLast.\n";
    await open(page, source);
    await caretAtEnd(page, "p");
    expect(await page.evaluate((n) => window.harness.insert(n), name)).toBe(true);
    const saved = await save(page);
    expect(newLines(source, saved).length).toBeGreaterThan(0);
    expect(saved.startsWith("First.\n")).toBe(true);
    expect(saved.endsWith("Last.\n")).toBe(true);
    // Click into the inserted construct, then remove it with the command.
    const inserted = page.locator(`.ProseMirror [data-ms="${name}"]`).first();
    await inserted.locator("p, td, figcaption").first().click();
    await page.waitForFunction(() => window.harness.selectionSettled());
    expect(await page.evaluate((n) => window.harness.remove(n), name)).toBe(true);
    expect(await save(page)).toBe(source);
  });
}

declare global {
  interface Window {
    harness: {
      load(source: string): void;
      save(): string;
      roundTrip(documents: Array<{ name: string; source: string }>): string[];
      insert(name: string): boolean;
      remove(name: string): boolean;
      pasteHTML(html: string): void;
      pasteText(text: string): void;
      selectionSettled(): boolean;
      selectAll(): void;
      copy(type: string): string;
    };
  }
}
