/**
 * Copy the canonical cases into the package, so npm can pack them.
 *
 * The suite lives at the repository root, under tests/, because spec §7 says
 * it does and because it mirrors the CommonMark layout a reader already knows.
 * npm packs only what is inside the package directory, so the files have to be
 * here at pack time. They are copied rather than moved, and never committed:
 * one canonical location, and a test that fails if this copy differs from it.
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export const packageDir = resolve(import.meta.dirname);
const repoRoot = resolve(packageDir, "..", "..");

export async function stage(into: string = packageDir): Promise<string[]> {
  const cases = join(into, "cases");
  await rm(cases, { recursive: true, force: true });
  await mkdir(cases, { recursive: true });
  const names = (await readdir(join(repoRoot, "tests"))).filter((n) => n.endsWith(".json")).sort();
  for (const name of names) await copyFile(join(repoRoot, "tests", name), join(cases, name));
  await copyFile(join(repoRoot, "spec", "conformance.schema.json"), join(into, "schema.json"));
  return names;
}

if (process.argv[1] === import.meta.filename) {
  const names = await stage();
  process.stdout.write(`conformance-suite: staged ${names.length} case files and the schema\n`);
}
