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

test("the heavy dev dependency stays out of the library", async () => {
  // mermaid-cli pulls puppeteer and a Chromium download. It exists for
  // site/mermaid.ts and nothing else, and CLAUDE.md says so; this keeps that
  // true. A package that reached for it would put a browser in the install
  // path of anyone consuming the renderer.
  const dirs = await readdir(join(root, "packages"));
  for (const dir of dirs) {
    const manifest = JSON.parse(await readFile(join(root, "packages", dir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const named = { ...manifest.dependencies, ...manifest.devDependencies };
    assert.ok(!("@mermaid-js/mermaid-cli" in named), `packages/${dir} must not depend on mermaid-cli`);
  }
  // And it is a dev dependency of the workspace root, never a runtime one.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.ok("@mermaid-js/mermaid-cli" in (pkg.devDependencies ?? {}), "declared as a dev dependency");
  assert.ok(!("@mermaid-js/mermaid-cli" in (pkg.dependencies ?? {})), "and not as a runtime one");
});

/** The packages that go to npm. The conformance harness is not one of them. */
const PUBLISHED = ["parser", "diagram-ascii", "render-downgrade", "render-html", "cli"];

test("every published package is publishable, and says the same version", async () => {
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  for (const name of PUBLISHED) {
    const d = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")) as Record<
      string,
      // biome-ignore lint/suspicious/noExplicitAny: a manifest is arbitrary JSON, and the assertions below are the shape check
      any
    >;
    assert.ok(!d.private, `${name} must not be private`);
    assert.equal(d.license, "MIT", `${name} needs a license or nobody may legally use it`);
    assert.equal(d.version, rootPkg.version, `${name} version must match the root`);
    assert.ok(d.files?.includes("dist"), `${name} must ship dist`);
    assert.ok(d.files?.includes("src"), `${name} ships src too, so declaration maps lead somewhere`);
    assert.ok(d.repository?.directory, `${name} should say where in the repo it lives`);

    const entry = d.exports["."];
    assert.match(entry["markset-source"], /^\.\/src\/.*\.ts$/u, `${name} resolves to source in this repo`);
    assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/u, `${name} types come from dist`);
    assert.match(entry.default, /^\.\/dist\/.*\.js$/u, `${name} installs as compiled JS`);
    // Order is the whole mechanism: first match wins, so the source condition
    // has to come before the two that a published consumer will hit.
    assert.equal(Object.keys(entry)[0], "markset-source", `${name} lists the source condition first`);

    for (const [dep, range] of Object.entries(d.dependencies ?? {})) {
      if (!dep.startsWith("@markset/")) continue;
      assert.equal(range, `^${rootPkg.version}`, `${name} must pin ${dep} to a real version, not "*"`);
    }
  }
});

test("the conformance harness stays private, because nothing consumes it", async () => {
  const d = JSON.parse(await readFile(join(root, "packages", "conformance", "package.json"), "utf8")) as {
    private?: boolean;
  };
  assert.equal(d.private, true);
});

test("every published package has a build config, and dist is not committed", async () => {
  for (const name of PUBLISHED) {
    const config = JSON.parse(await readFile(join(root, "packages", name, "tsconfig.build.json"), "utf8")) as {
      extends: string;
      compilerOptions: { outDir: string; rootDir: string };
    };
    assert.equal(config.extends, "../../tsconfig.build.json");
    assert.equal(config.compilerOptions.outDir, "dist");
  }
  // Emitted output is never committed: a stale dist in the tree is a bug that
  // only shows up for whoever installs it.
  const ignore = await readFile(join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^packages\/\*\/dist\/$/mu);
  // And the shared config must rewrite .ts specifiers, or the emitted JS
  // imports files that do not exist once compiled.
  const build = JSON.parse(await readFile(join(root, "tsconfig.build.json"), "utf8")) as {
    compilerOptions: Record<string, unknown>;
  };
  assert.equal(build.compilerOptions.rewriteRelativeImportExtensions, true);
  assert.equal(build.compilerOptions.declaration, true);
  assert.equal(build.compilerOptions.declarationMap, true);
});

test("the development workflow asks for source, in every script that runs node", async () => {
  // Without the condition, running anything in this repo resolves @markset/*
  // to a dist that a fresh clone has not built. tsc needs the same thing, by
  // its own spelling.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (!script.startsWith("node ")) continue;
    assert.match(script, /--conditions=markset-source/u, `script "${name}" runs node without the source condition`);
  }
  const ts = JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")) as {
    compilerOptions: { customConditions?: string[] };
  };
  assert.deepEqual(ts.compilerOptions.customConditions, ["markset-source"]);
});

test("the formatter leaves build output alone, at any depth", async () => {
  // "!dist" excludes the site's output directory and nothing else: the
  // packages' dist/ sat one level deeper and was being formatted and linted as
  // though it were source. Generated files are not ours to style, and after a
  // build the lint gate would have been judging the compiler's output.
  const text = await readFile(join(root, "biome.jsonc"), "utf8");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as { files: { includes: string[] } };
  assert.ok(config.files.includes.includes("!**/dist"), "dist is excluded wherever it appears");
});

test("every published package asks to be public", async () => {
  // A scoped package defaults to restricted, which needs a paid plan: without
  // this the first publish fails instead of going out publicly.
  for (const name of PUBLISHED) {
    const d = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")) as {
      publishConfig?: { access?: string };
    };
    assert.equal(d.publishConfig?.access, "public", `${name} would publish restricted`);
  }
});

test("the manifests are already in the form npm would rewrite them into", async () => {
  // npm silently "auto-corrects" a manifest on publish and warns that it did.
  // A warning on every release that says errors were corrected is a warning
  // people stop reading, and it means the published manifest differs from the
  // one in the repository. These are the two npm pkg fix wanted.
  for (const name of [...PUBLISHED, "."]) {
    const dir = name === "." ? root : join(root, "packages", name);
    const d = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
      repository?: { url: string };
      bin?: Record<string, string>;
    };
    if (d.repository) {
      assert.match(d.repository.url, /^git\+https:\/\//u, `${name}: repository.url wants a git+ prefix`);
    }
    for (const [command, path] of Object.entries(d.bin ?? {})) {
      assert.doesNotMatch(path, /^\.\//u, `${name}: bin.${command} should not lead with ./`);
    }
  }
});

test("the release names every published package, and nothing else", async () => {
  // --workspaces would be shorter and it also sweeps up the two private
  // packages, which npm's dry run happily lists. Naming them is the only
  // spelling that cannot quietly publish the test harness, and this keeps the
  // list honest when a package is added.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const release = pkg.scripts.release;
  assert.match(release, /^npm run build &&/u, "a release always builds first, so dist cannot be stale");
  const named = [...release.matchAll(/--workspace (@markset\/[a-z-]+)/gu)].map((m) => m[1]);
  assert.deepEqual(named.sort(), PUBLISHED.map((n) => `@markset/${n}`).sort());
  assert.doesNotMatch(release, /--workspaces\b/u, "never the sweep-everything form");
});

test("the release workflow proves the build before it publishes", async () => {
  const yaml = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(yaml, /tags: \["v\*"\]/u, "a release is a deliberate tag, not every push");
  assert.match(yaml, /id-token: write/u, "provenance needs it");
  assert.match(yaml, /--provenance/u, "each tarball is tied to the run that built it");
  assert.match(yaml, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/u);
  for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run conformance"]) {
    assert.ok(yaml.includes(step), `the release re-proves ${step}, since a tag can come from anywhere`);
  }
  assert.match(yaml, /does not match package version/u, "the tag must match the version it claims");
});
