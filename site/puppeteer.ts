/**
 * The puppeteer that arrives with @mermaid-js/mermaid-cli, which the site
 * already needs for drawing mermaid fences. It is reached through mermaid-cli
 * rather than declared: under pnpm a package's own dependencies are not on the
 * importer's path, so `import("puppeteer")` would find nothing, and declaring
 * it would put a second Chrome download in the install. Null when mermaid-cli
 * or its puppeteer is missing, so a caller can report a skip with a reason.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// biome-ignore lint/suspicious/noExplicitAny: puppeteer's types are not on this package's path either.
export async function loadPuppeteer(): Promise<any | null> {
  try {
    const cli = createRequire(import.meta.url).resolve("@mermaid-js/mermaid-cli");
    const entry = createRequire(cli).resolve("puppeteer");
    const module = await import(pathToFileURL(entry).href);
    return module.default ?? module;
  } catch {
    return null;
  }
}
