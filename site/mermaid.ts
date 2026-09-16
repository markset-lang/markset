/**
 * A mermaid engine for diagram fences (spec §10).
 *
 * A "engine" is whatever turns a fence into a picture. This one shells out to
 * mermaid's own command line, so the pictures are real mermaid rather than an
 * approximation of it — Markset itself still draws nothing but ASCII.
 *
 * The awkward part is color. The ASCII engine carries one palette and a
 * prefers-color-scheme block, so a diagram follows the reader's choice. mermaid
 * bakes a theme into the SVG it produces and has no such switch, so a single
 * render is readable in one scheme and poor in the other. The fix is to render
 * twice, with mermaid's own light and dark themes, and splice both into one
 * picture that shows whichever half matches — which is the same mechanism, just
 * paid for twice. Each render is given its own svg id so the two style blocks
 * mermaid writes cannot collide.
 *
 * Runnable directly as well, so it works as a --diagram command:
 *
 *   markset html doc.md --diagram mermaid="node site/mermaid.ts"
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MMDC = resolve(import.meta.dirname, "..", "node_modules", ".bin", "mmdc");
/**
 * Chrome's sandbox is unavailable in most CI containers, and without this the
 * Pages build fails at the first diagram. The content being rendered is this
 * repository's own diagram fences, on a runner that is already running our
 * build, so the sandbox is not what is protecting anything here.
 */
const PUPPETEER_CONFIG = resolve(import.meta.dirname, "puppeteer.json");

/** Render one mermaid source as SVG, or throw. Throwing is how §10 obligation 5 is declined. */
export function drawMermaid(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ms-mermaid-"));
  try {
    const input = join(dir, "in.mmd");
    writeFileSync(input, source);
    const light = render(dir, input, "neutral", "ms-mmd-light");
    const dark = render(dir, input, "dark", "ms-mmd-dark");
    return splice(light, dark);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function render(dir: string, input: string, theme: string, id: string): string {
  const out = join(dir, `${id}.svg`);
  const args = ["-i", input, "-o", out, "-t", theme, "-b", "transparent", "-I", id, "-p", PUPPETEER_CONFIG];
  execFileSync(MMDC, args, { stdio: ["ignore", "ignore", "pipe"] });
  return readFileSync(out, "utf8");
}

/**
 * Put both renders inside one SVG and let the media query pick.
 *
 * The inner elements keep their own viewBox and their own scoped styles, so
 * nesting them is enough; only the outer box needs real dimensions, or the
 * <img> that carries this has no intrinsic size to lay out with.
 */
function splice(light: string, dark: string): string {
  const box = /viewBox="([\d.\s-]+)"/u.exec(light);
  if (!box) throw new Error("mermaid produced an SVG with no viewBox");
  const [, , width, height] = box[1].split(/\s+/u).map(Number);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ` width="${width}" height="${height}" viewBox="${box[1]}">`,
    // This is XML: no raw angle bracket or ampersand may appear in here.
    `<style>.ms-mmd-dark{display:none}`,
    `@media (prefers-color-scheme: dark){.ms-mmd-light{display:none}.ms-mmd-dark{display:inline}}`,
    `</style>`,
    `<g class="ms-mmd-light">${strip(light)}</g>`,
    `<g class="ms-mmd-dark">${strip(dark)}</g>`,
    `</svg>`,
  ].join("");
}

/** Drop the XML prologue and the outer width/height, which the wrapper now owns. */
function strip(svg: string): string {
  return svg
    .replace(/^[\s\S]*?(?=<svg)/u, "")
    .replace(/ width="[^"]*"/u, "")
    .replace(/ style="[^"]*"/u, "");
}

// Read a fence on stdin and write SVG on stdout, so this file is also an engine
// command. Guarded so importing it costs nothing.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=site\/mermaid\.ts$)/u, ""))) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  process.stdout.write(drawMermaid(Buffer.concat(chunks).toString("utf8")));
}
