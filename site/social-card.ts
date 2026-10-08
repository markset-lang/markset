/**
 * Draws `site/social-card.png`, the image a link to markset.org previews as in a
 * chat client, a feed or a search result.
 *
 *   pnpm run site:social-card
 *
 * Committed rather than drawn at build time, for the reason the thumbnails are:
 * taking it needs a browser, every test that builds the site would pay for it,
 * and the picture changes only when the mark, the headline or the tokens do.
 * A test holds the committed file to the size the pages tell a client to expect.
 *
 * The browser is mermaid-cli's puppeteer, with the flags site/mermaid.ts passes
 * it, as site/thumbnails.ts uses. The card is the site's own: the mark from
 * site/icon.svg, the home page's headline, and the dark values of the tokens in
 * site/site.css, which hold their own against a light client and a dark one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadPuppeteer } from "./puppeteer.ts";

const root = resolve(import.meta.dirname, "..");

/** What every platform that reads og:image expects, and the size the test holds. */
export const CARD = { width: 1200, height: 630, file: "social-card.png" };

/** The home page's headline, which is what the site is for in one line. */
export const CARD_HEADLINE = "Documents your agents write, and people want to read";

/** What the card says, for a reader who is given its alternative text instead of the picture. */
export const CARD_ALT = `Markset: ${CARD_HEADLINE}`;

/** The card's markup: the site's dark tokens, its mark, and its headline. */
export function cardHtml(mark: string, host: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  :root {
    --fg: #e3e6ea;
    --muted: #a0a8b1;
    --bg: #17141d;
    --accent: #c2b3e3;
    --border: #322b40;
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${CARD.width}px;
    height: ${CARD.height}px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 76px 84px;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 38px; font-weight: 700; letter-spacing: -0.02em; }
  .brand img { width: 64px; height: 64px; }
  h1 { font-size: 72px; line-height: 1.08; font-weight: 700; letter-spacing: -0.035em; max-width: 16ch; }
  .foot { display: flex; align-items: baseline; gap: 18px; font-size: 26px; color: var(--muted); }
  .foot .host { color: var(--accent); font-weight: 600; }
  .rule { height: 1px; background: var(--border); margin-bottom: 30px; }
</style>
<body>
  <div class="brand"><img src="${mark}" alt="">Markset</div>
  <h1>${CARD_HEADLINE}</h1>
  <div>
    <div class="rule"></div>
    <div class="foot"><span class="host">${host}</span><span>A Coral Reef Ventures project</span></div>
  </div>
</body>
</html>
`;
}

/** Draws the card and writes it beside this file. */
export async function drawCard(to: string = join(root, "site", CARD.file)): Promise<string> {
  const puppeteer = await loadPuppeteer();
  if (!puppeteer)
    throw new Error("site:social-card: puppeteer is not installed; it arrives with @mermaid-js/mermaid-cli");
  const args = JSON.parse(await readFile(join(import.meta.dirname, "puppeteer.json"), "utf8")).args as string[];
  const host = new URL(JSON.parse(await readFile(join(root, "package.json"), "utf8")).homepage).host;
  const svg = await readFile(join(root, "site", "icon.svg"), "utf8");
  const mark = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const browser = await puppeteer.launch({ args });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD.width, height: CARD.height, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await page.setContent(cardHtml(mark, host), { waitUntil: "networkidle0" });
    await writeFile(to, await page.screenshot({ type: "png" }));
    return to;
  } finally {
    await browser.close();
  }
}

if (import.meta.filename === process.argv[1]) console.log(`site:social-card: ${await drawCard()}`);
