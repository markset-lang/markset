/**
 * Renders media/preview.png, the picture at the top of the marketplace listing:
 * a Markset source in an editor pane beside the document it renders to. The
 * right pane is this implementation's own output under the default stylesheet,
 * scoped the way the built-in preview scopes it, so the picture is a rendering
 * and not a mock-up. Run from the repository root:
 *
 *   node --conditions=markset-source editors/vscode/media/hero.mjs
 */
import puppeteer from "puppeteer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "@markset-lang/parser";
import { renderHtml, defaultStylesheetPath } from "@markset-lang/render-html";
import { scopeStylesheet } from "../src/core.ts";

const source = `---
markset: 0
theme:
  preset: report
---

# Q3 platform review

{.lead}
Three numbers, three decisions, one warning.

:::metrics
| Measure | Value | Change |
|---|---|---|
| Uptime | 99.97% | +0.02% |
| Throughput | 4.1k rps | +12% |
| Error budget left | 61% | +8% |
:::

:::grid{cols=3}
- ### Ship the cache
  Cuts p95 by a third in staging.
- ### Retire v1 API
  Eleven callers left, all internal.
- ### Hire on-call
  One rotation is not a rotation.
:::

> [!WARNING] Certificates expire 14 Oct
> Rotation is scripted; the calendar is not.
`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colored = source
  .split("\n")
  .map((line) => {
    if (/^:{3,}/.test(line)) return `<span class="fence">${esc(line)}</span>`;
    if (/^\{/.test(line)) return `<span class="attr">${esc(line)}</span>`;
    if (/^> \[!/.test(line)) return `<span class="call">${esc(line)}</span>`;
    if (/^#/.test(line)) return `<span class="head">${esc(line)}</span>`;
    if (/^---$/.test(line) || /^(markset|theme| {2}preset):/.test(line)) return `<span class="fm">${esc(line)}</span>`;
    return esc(line);
  })
  .join("\n");

const css = scopeStylesheet(await readFile(defaultStylesheetPath, "utf8"));
const { ast } = parseDocument(source);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style>
<style>
html,body{margin:0;background:#0f1216}
.shot{display:grid;grid-template-columns:560px 840px;width:1400px;height:820px;font-family:-apple-system,system-ui,sans-serif}
.editor{background:#1e1e1e;color:#d4d4d4;padding:28px 32px;font:14.5px/1.55 "SF Mono",Menlo,Consolas,monospace;white-space:pre;overflow:hidden;position:relative}
.editor .fence{color:#4fc1ff}.editor .attr{color:#dcdcaa}.editor .call{color:#ce9178}.editor .head{color:#569cd6;font-weight:600}.editor .fm{color:#6a9955}
.tab{position:absolute;top:0;left:0;right:0;height:38px;background:#181818;border-bottom:1px solid #2b2b2b;display:flex;align-items:center;padding:0 18px;font:12.5px system-ui;color:#bbb;gap:8px}
.tab .dot{width:10px;height:10px;border-radius:50%;background:#2563eb;display:inline-block}
.editor pre{margin:46px 0 0;background:none;padding:0;color:inherit;font:inherit}
.preview{background:#fff;padding:24px 40px 0;overflow:hidden;position:relative}
.preview .ptab{height:38px;margin:0 -40px 18px;background:#f0f2f4;border-bottom:1px solid #dfe3e6;display:flex;align-items:center;padding:0 18px;font:12.5px system-ui;color:#555}
.preview .ms-document{--ms-base:15px;font-size:15px}
.preview .ms-document > h1{margin-top:0.2rem}
</style></head><body>
<div class="shot">
  <div class="editor"><div class="tab"><span class="dot"></span> review.md</div><pre>${colored}</pre></div>
  <div class="preview"><div class="ptab">Preview review.md</div><main class="ms-document" data-scheme="light">${renderHtml(ast)}</main></div>
</div></body></html>`;
const dir = await mkdtemp(join(tmpdir(), "markset-hero-"));
const file = join(dir, "hero.html");
await writeFile(file, html);
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 820, deviceScaleFactor: 2 });
await page.goto(`file://${file}`, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: new URL("./preview.png", import.meta.url).pathname,
  clip: { x: 0, y: 0, width: 1400, height: 820 },
});
await browser.close();
await rm(dir, { recursive: true, force: true });
console.log("hero written");
