import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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
