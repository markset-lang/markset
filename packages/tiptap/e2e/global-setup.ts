/** Bundle the harness once for every browser, from src/, the way the site bundles its pages. */
import { build } from "esbuild";
import { join } from "node:path";

export const BUNDLE = join(import.meta.dirname, ".build", "harness.js");

export default async function globalSetup(): Promise<void> {
  await build({
    entryPoints: [join(import.meta.dirname, "harness.ts")],
    outfile: BUNDLE,
    bundle: true,
    format: "iife",
    target: ["es2022"],
    conditions: ["markset-source"],
    logLevel: "silent",
  });
}
