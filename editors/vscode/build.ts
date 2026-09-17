/**
 * Builds the extension into dist/: the bundled script, the stylesheet it
 * inlines into the preview, and the snippets derived from the conformance
 * suite. Run by `npm run build` in this directory and by the test that proves
 * the bundle builds.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { build as esbuildBundle } from "esbuild";
import { defaultStylesheetPath } from "@markset-lang/render-html";
import { buildSnippets, type SnippetCase } from "./src/core.ts";

const here = import.meta.dirname;
const root = join(here, "..", "..");

export async function buildExtension(out: string = join(here, "dist")): Promise<string[]> {
  await mkdir(out, { recursive: true });
  await esbuildBundle({
    entryPoints: [join(here, "src", "extension.ts")],
    outfile: join(out, "extension.cjs"),
    bundle: true,
    // The extension host is node and loads CommonJS through require, and the
    // manifest says "type": "module" so the TypeScript sources typecheck as
    // the ES modules they are -- so the bundle takes the .cjs extension, which
    // says what it is whatever the manifest says. `vscode` is provided by the
    // host and must stay a bare require.
    format: "cjs",
    platform: "node",
    target: ["node20"],
    external: ["vscode"],
    // The renderer computes its stylesheet path from import.meta.url at load
    // time. A CommonJS bundle has no import.meta, and esbuild shims it as an
    // empty object, so `new URL(x, undefined)` would throw the moment the
    // extension activated. Give it the bundle's own URL instead.
    banner: { js: 'const import_meta_url = require("node:url").pathToFileURL(__filename).href;' },
    define: { "import.meta.url": "import_meta_url" },
    sourcemap: true,
    // Built from src/, like the playground, so a stale dist/ cannot reach an editor.
    conditions: ["markset-source"],
    logLevel: "silent",
  });
  await copyFile(defaultStylesheetPath, join(out, "markset.css"));
  const cases: Record<string, SnippetCase[]> = {};
  const dir = join(root, "tests");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    cases[basename(file, ".json")] = JSON.parse(await readFile(join(dir, file), "utf8"));
  }
  await writeFile(join(out, "snippets.json"), `${JSON.stringify(buildSnippets(cases), null, 2)}\n`);
  // vsce wants a LICENSE beside the manifest; the repository has one, at the root.
  await copyFile(join(root, "LICENSE"), join(here, "LICENSE"));
  return ["extension.cjs", "extension.cjs.map", "markset.css", "snippets.json"].map((f) => join(out, f));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const written = await buildExtension();
  console.log(`markset-vscode: ${written.length} files written to ${join(here, "dist")}`);
}
