import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readdir } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");

/**
 * Comments are why this file exists. A `//` comment inside `biome.json` does
 * not fail: Biome drops the members that follow it in that object, silently,
 * so the configuration reads as applied and is not. Two rule overrides and the
 * line width disappeared that way and nothing said so. The file is `.jsonc`
 * now, where comments are supported, and this asserts the settings survived
 * parsing rather than trusting that they did.
 */
test("the biome configuration parses with its comments and keeps every setting", async () => {
  const text = await readFile(join(root, "biome.jsonc"), "utf8");
  assert.match(text, /^\s*\/\//m, "the config carries comments, which is the thing that used to break it");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));

  assert.equal(config.formatter.lineWidth, 120);
  assert.equal(config.formatter.indentStyle, "space");
  assert.equal(config.linter.rules.preset, "recommended");
  assert.equal(config.linter.rules.style.noNonNullAssertion, "off");
  assert.equal(config.linter.rules.complexity.noImportantStyles, "off");

  const css = config.overrides.find((o: { includes: string[] }) => o.includes.includes("**/*.css"));
  assert.ok(css, "stylesheets are exempt from the formatter");
  assert.equal(css.formatter.enabled, false);
  assert.equal(css.linter.rules.style.noDescendingSpecificity, "off");

  const cases = config.overrides.find((o: { includes: string[] }) => o.includes.includes("tests/**/*.json"));
  assert.ok(cases, "the generated conformance suite is exempt from the formatter");
  assert.equal(cases.formatter.enabled, false);
});

test("lint runs in CI, as a gate rather than a suggestion", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /- run: npm run lint\n/, "a formatter nobody enforces is a formatter nobody runs");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.lint, "biome check .");
  assert.equal(pkg.scripts.format, "biome check --write .");
});

/**
 * The release version is written in thirteen places: seven package.json files,
 * the spec's frontmatter and its status line, the changelog, the README, the
 * home page badge and a span demo in the tour. package.json is the one that is
 * true; the rest are copies, and copies drift the moment nothing checks them.
 */
test("every copy of the version agrees with package.json", async () => {
  const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version as string;
  assert.match(version, /^\d+\.\d+\.\d+(-rc\.\d+)?$/, version);

  const manifests = [
    "site/package.json",
    ...(await readdir(join(root, "packages"))).map((p) => `packages/${p}/package.json`),
  ];
  for (const file of manifests) {
    const pkg = JSON.parse(await readFile(join(root, file), "utf8"));
    assert.equal(pkg.version, version, `${file} is on ${pkg.version}`);
  }

  const spec = await readFile(join(root, "spec", "v0.md"), "utf8");
  assert.match(spec, new RegExp(`^version: ${version}$`, "m"), "spec frontmatter");
  assert.ok(spec.includes(`\`${version}\``), "the spec's status line names the implementation version");

  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  assert.match(
    changelog,
    new RegExp(`^## ${version.replace(/\./g, "\\.")} — `, "m"),
    "the changelog has a section for it",
  );

  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.ok(readme.includes(`\`${version}\``), "README status line names the version");

  for (const page of ["site/content/index.md", "examples/showcase.md"]) {
    const text = await readFile(join(root, page), "utf8");
    assert.ok(text.includes(version), `${page} shows a stale version`);
  }
});
