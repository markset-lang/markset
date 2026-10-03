/**
 * The first screen of every example in the gallery, in both color schemes, for the examples index.
 *
 *   npm run site:thumbnails
 *
 * They are committed rather than taken at build time. Taking them needs a browser, and the build already
 * launches one for mermaid, but every test that builds the site would pay for sixteen screenshots, and the
 * pictures only change when an example does. So each example is recorded in manifest.json against a hash of
 * what its thumbnails were taken from — the document, its theme and its images — and a test fails when an
 * example has changed since. The site's own stylesheets are not in the hash: they change often, under every
 * example at once and usually slightly, and a thumbnail is a preview rather than a proof. Run this again
 * after a change to the site's look that a reader would notice at thumbnail size.
 *
 * The browser is mermaid-cli's puppeteer, as in site/test/playground-browser.test.ts, launched with the
 * same flags site/mermaid.ts passes it.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type EXAMPLES, GALLERY } from "./build.ts";

const root = resolve(import.meta.dirname, "..");
export const THUMBNAILS = join(root, "site", "thumbnails");
export const SCHEMES = ["light", "dark"] as const;

/** A thumbnail's width over its height. The index crops to the same shape, so nothing is cut twice. */
const ASPECT = 1.6;

/** What an example's thumbnails were taken from, as a short hash: the document, its theme, its images. */
export async function sourceHash(example: (typeof EXAMPLES)[number]): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(join(root, "examples", example.file)));
  if (example.theme) hash.update(await readFile(join(root, "examples", example.theme)));
  const assets = join(root, "examples", basename(example.file, ".md"));
  const files = await readdir(assets, { recursive: true }).catch(() => []);
  for (const file of files.sort()) {
    const path = join(assets, file);
    if (!(await stat(path)).isFile()) continue;
    hash.update(file);
    hash.update(await readFile(path));
  }
  return hash.digest("hex").slice(0, 16);
}

async function capture(): Promise<void> {
  const puppeteer = await import("puppeteer").then(
    (m) => m.default,
    () => null,
  );
  if (!puppeteer)
    throw new Error("site:thumbnails: puppeteer is not installed; it arrives with @mermaid-js/mermaid-cli");
  const args = JSON.parse(await readFile(join(import.meta.dirname, "puppeteer.json"), "utf8")).args as string[];

  const scratch = await mkdtemp(join(tmpdir(), "markset-thumbnails-"));
  const browser = await puppeteer.launch({ args });
  try {
    const dist = join(scratch, "dist");
    await build(dist);
    // Start from nothing, so an example that has left the gallery leaves no pictures behind.
    await rm(THUMBNAILS, { recursive: true, force: true });
    await mkdir(THUMBNAILS, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const manifest: Record<string, string> = {};
    for (const example of GALLERY) {
      for (const scheme of SCHEMES) {
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
        await page.goto(pathToFileURL(join(dist, "examples", example.slug, "index.html")).href, {
          waitUntil: "networkidle0",
        });
        // The document only: the header and the rail are the same on every page and would be most of the picture.
        const box = await page.evaluate(() => {
          const r = (document.querySelector("main") as HTMLElement).getBoundingClientRect();
          return { x: r.x, y: r.y + window.scrollY, width: r.width };
        });
        const path = join(THUMBNAILS, `${example.slug}.${scheme}.webp`);
        const clip = { ...box, height: Math.round(box.width / ASPECT) };
        await page.screenshot({ path, type: "webp", quality: 72, clip });
      }
      manifest[example.slug] = await sourceHash(example);
    }
    await writeFile(join(THUMBNAILS, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`site:thumbnails: ${GALLERY.length * SCHEMES.length} thumbnails written to site/thumbnails/`);
  } finally {
    await browser.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await capture();
