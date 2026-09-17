import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadCases, loadSection, sections } from "@markset-lang/conformance-suite";
import { stage } from "../stage.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const canonical = join(root, "tests");

test("the packaged cases are byte-identical to the canonical ones", async () => {
  // The suite lives at the repository root and is copied here so npm can pack
  // it, which is two locations and therefore a chance to drift. This is the
  // only thing stopping a published case file from quietly differing from the
  // one the reference implementation is actually tested against.
  const dir = await mkdtemp(join(tmpdir(), "markset-suite-"));
  try {
    const staged = await stage(dir);
    const expected = (await readdir(canonical)).filter((n) => n.endsWith(".json")).sort();
    assert.deepEqual(staged, expected, "every section is staged, and nothing else");
    for (const name of expected) {
      assert.equal(
        await readFile(join(dir, "cases", name), "utf8"),
        await readFile(join(canonical, name), "utf8"),
        `${name} differs from tests/${name}`,
      );
    }
    assert.equal(
      await readFile(join(dir, "schema.json"), "utf8"),
      await readFile(join(root, "spec", "conformance.schema.json"), "utf8"),
      "the schema shipped is the normative one",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the copy that would actually be packed matches too", async () => {
  // The test above proves the staging function is correct, which is not the
  // same as the working copy being correct -- and it is the working copy that
  // npm packs. The formatter reached in and rewrote all fifteen files here
  // once, and nothing noticed: the copy is gitignored, so no diff shows it,
  // and staging into a temporary directory hides it by construction.
  const cases = join(import.meta.dirname, "..", "cases");
  const staged = await readdir(cases).catch(() => null);
  if (staged === null) return; // not staged yet in a fresh clone; the build makes it
  for (const name of staged.filter((n) => n.endsWith(".json"))) {
    assert.equal(
      await readFile(join(cases, name), "utf8"),
      await readFile(join(canonical, name), "utf8"),
      `packages/conformance-suite/cases/${name} has drifted from tests/${name}`,
    );
  }
});

test("the package ships the data, not only the loader", async () => {
  // The JSON is the artifact: an implementation in a language with no
  // JavaScript in sight reads these files directly. Shipping only dist would
  // make this a JavaScript package that happens to contain a test suite.
  const pkg = JSON.parse(await readFile(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    files: string[];
    exports: Record<string, unknown>;
    dependencies?: Record<string, string>;
  };
  assert.ok(pkg.files.includes("cases"), "the cases ship");
  assert.ok(pkg.files.includes("schema.json"), "and the schema they are validated against");
  assert.ok(pkg.exports["./schema.json"], "both are reachable by path, without going through the loader");
  assert.ok(pkg.exports["./cases/*.json"]);
  // No implementation, and nothing that drags one in: this package is what an
  // implementation is measured against, so it must not depend on one.
  assert.deepEqual(pkg.dependencies ?? {}, {}, "the suite depends on no implementation, including ours");
});

test("the loader reads a checkout's tests directory as readily as its own", () => {
  const names = sections(canonical);
  assert.ok(names.length >= 15, `expected every section, found ${names.length}`);
  assert.ok(names.includes("grid") && names.includes("diagram"));

  const all = loadCases(canonical);
  assert.ok(all.length > 300, `expected the full suite, found ${all.length}`);
  for (const c of all) {
    assert.equal(typeof c.markset, "string", "every case carries source");
    assert.equal(typeof c.valid, "boolean");
    if (c.valid) assert.notEqual(c.ast, undefined, `${c.section}: a valid case pins an AST (§7)`);
    else assert.ok((c.diagnostics ?? []).length > 0, `${c.section}: an invalid case names its codes (§7)`);
  }
  // The section field and the file name are the same thing, which is what lets
  // a consumer report a failure against a place in the spec.
  for (const section of names) {
    for (const c of loadSection(section, canonical)) assert.equal(c.section, section);
  }
});
