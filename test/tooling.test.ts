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

  // The editor extension is deliberately absent: it is published by hand to a
  // different registry on its own schedule, and every upload there needs a new
  // version. Tying it to this one would force an npm release of eight unchanged
  // packages to ship an extension fix.
  const manifests = ["site/package.json", ...(await packageDirs()).map((p) => `packages/${p}/package.json`)];
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
  for (const dir of await packageDirs()) {
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
/**
 * The workspace packages, by directory. Filtered to directories because a
 * .DS_Store that Finder drops into packages/ is not a package, and two tests
 * failed on exactly that on 2026-09-17.
 */
async function packageDirs(): Promise<string[]> {
  const entries = await readdir(join(root, "packages"), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

const PUBLISHED = [
  "parser",
  "diagram-ascii",
  "chart-table",
  "render-downgrade",
  "render-html",
  "cli",
  "remark-markset",
  "conformance-suite",
];

test("every published package is publishable, and says the same version", async () => {
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
    homepage: string;
  };
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
    // The homepage is the link npm shows on the package page, so a stale copy
    // sends every reader who arrives through npm to the wrong site. It is one
    // string repeated eight times, which is exactly the shape that drifts.
    assert.equal(d.homepage, rootPkg.homepage, `${name} homepage must match the root`);

    const entry = d.exports["."];
    assert.match(entry["markset-source"], /^\.\/src\/.*\.ts$/u, `${name} resolves to source in this repo`);
    assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/u, `${name} types come from dist`);
    assert.match(entry.default, /^\.\/dist\/.*\.js$/u, `${name} installs as compiled JS`);
    // Order is the whole mechanism: first match wins, so the source condition
    // has to come before the two that a published consumer will hit.
    assert.equal(Object.keys(entry)[0], "markset-source", `${name} lists the source condition first`);

    for (const [dep, range] of Object.entries(d.dependencies ?? {})) {
      if (!dep.startsWith("@markset-lang/")) continue;
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
  // Without the condition, running anything in this repo resolves @markset-lang/*
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

  // A script is not the only way this repository starts node. The dev server
  // spawns the build as a child, and that child needs the condition of its own:
  // the parent's flags are not inherited, and process.execArgv is empty when the
  // flag came from an npm script. This assertion exists because it did not, and
  // site:watch spent an afternoon rendering pages through a dist/ that predated
  // the feature being looked at -- silently, because a stale dist/ still builds.
  const serve = await readFile(join(root, "site", "serve.ts"), "utf8");
  const spawned = /spawn\(\s*process\.execPath,\s*\[([^\]]*)\]/u.exec(serve);
  assert.ok(spawned, "site/serve.ts spawns node");
  assert.match(spawned[1], /--conditions=markset-source/u, "the spawned build asks for source too");
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

test("every published package has a README that names it", async () => {
  // npm shows the README as the package page. Six packages shipped 0.3.0 with
  // none, so the page an adopter lands on first was blank; an eighth package
  // must not repeat that.
  for (const name of PUBLISHED) {
    const readme = await readFile(join(root, "packages", name, "README.md"), "utf8").catch(() => "");
    assert.match(readme, new RegExp(`^# @markset-lang/${name}$`, "m"), `${name} has no README naming it`);
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
  const named = [...release.matchAll(/--workspace (@markset-lang\/[a-z-]+)/gu)].map((m) => m[1]);
  assert.deepEqual(named.sort(), PUBLISHED.map((n) => `@markset-lang/${n}`).sort());
  assert.doesNotMatch(release, /--workspaces\b/u, "never the sweep-everything form");
});

test("the release publishes each package after everything it depends on", async () => {
  // The publish step stops at the first failure, and that is the right design
  // only because of this order: a package that goes out points only at versions
  // that already exist, because its dependencies went out before it. The 0.3.1
  // run stopped at the third package with two published, and nothing installed
  // from the registry was broken. Reorder the list and a stop would strand a
  // package whose dependency never arrived.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const named = [...pkg.scripts.release.matchAll(/--workspace @markset-lang\/([a-z-]+)/gu)].map((m) => m[1]);
  for (const [i, name] of named.entries()) {
    const d = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const dep of Object.keys(d.dependencies ?? {})) {
      if (!dep.startsWith("@markset-lang/")) continue;
      const j = named.indexOf(dep.slice("@markset-lang/".length));
      assert.ok(j !== -1 && j < i, `${name} depends on ${dep}, which must be released before it`);
    }
  }
});

test("the release workflow proves the build before it publishes", async () => {
  const yaml = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(
    yaml,
    /tags: \["v\[0-9\]\*"\]/u,
    "a release is a deliberate v-tag; vscode-v* tags belong to the extension and must not start a run",
  );
  assert.match(yaml, /id-token: write/u, "trusted publishing and provenance both need it");
  assert.match(yaml, /--provenance/u, "each tarball is tied to the run that built it");
  for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run conformance"]) {
    assert.ok(yaml.includes(step), `the release re-proves ${step}, since a tag can come from anywhere`);
  }
  assert.match(yaml, /does not match package version/u, "the tag must match the version it claims");
  // ...but only on a tag. GITHUB_REF_NAME is the branch on a manual run, so an
  // unconditional check makes the workflow_dispatch trigger above unusable.
  assert.match(yaml, /if: startsWith\(github\.ref, 'refs\/tags\/'\)/u, "and only when there is one");
});

test("the release workflow can be run a second time without failing", async () => {
  // npm answers a second publish of a version that already exists with a 403.
  // Run all five as one command and that 403 fails the step, stranding every
  // package after it -- so a re-pushed tag, or a rerun after a partial
  // publish, would do damage rather than nothing. The first release of this
  // scope was published by hand and needed exactly that rerun.
  const yaml = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(yaml, /curl -sf -o \/dev\/null "https:\/\/registry\.npmjs\.org/u, "asks the registry before it writes");
  assert.doesNotMatch(
    yaml,
    /npm view/u,
    "over plain HTTPS: npm view fails on a bad token, which would read as not published",
  );
  assert.doesNotMatch(yaml, /npm run release/u, "and not the all-at-once script, which cannot skip");
  // The list it walks is the one the release script names. Two copies of it
  // would be two things to keep in step, and the test above only governs one.
  assert.match(yaml, /scripts\.release\.match/u, "derives the package list rather than repeating it");
  // These packages publish through npm's trusted publishing, so the workflow
  // configures no credential at all: npm exchanges the OIDC token GitHub mints
  // for the run. An .npmrc carrying an empty _authToken is worse than none --
  // npm tries that credential, is refused, and never reaches the OIDC path,
  // which is precisely how npm ci failed in this workflow once already. Both
  // spellings of that mistake stay out.
  assert.doesNotMatch(yaml, /NODE_AUTH_TOKEN/u, "no token: publishing is by OIDC");
  assert.doesNotMatch(yaml, /registry-url/u, "and nothing writes an .npmrc for one");
});

test("every dependency resolves to the public registry", async () => {
  // A private registry in a contributor's ~/.npmrc is written into the
  // lockfile as the resolved URL for anything it serves, and npm ci then
  // sends an empty credential to a host that demands one. It fails with a
  // 401 about a password, on a machine that never configured a password,
  // for a package nobody added -- and it fails at install, so nothing else
  // in the job gets far enough to say anything more useful. It broke every
  // workflow in this repository for five commits before anyone read a log.
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")) as {
    packages: Record<string, { resolved?: string }>;
  };
  const foreign = Object.entries(lock.packages)
    .filter(([, v]) => v.resolved?.startsWith("http") && !v.resolved.startsWith("https://registry.npmjs.org/"))
    .map(([name, v]) => `${name} -> ${v.resolved}`);
  assert.deepEqual(foreign, [], "a lockfile entry points somewhere only one machine can reach");
});

test("the README names every published package, so its count cannot go stale", async () => {
  // It said "seven packages" and listed six of them, after chart-table had
  // been on the registry for a day. A reader arriving from npm counts.
  const readme = await readFile(join(root, "README.md"), "utf8");
  const sentence = /^(\w+) packages are published under the `@markset-lang` scope: (.*)$/mu.exec(readme);
  assert.ok(sentence, "the README has the sentence that lists the published packages");
  const words: Record<string, number> = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  assert.equal(words[sentence[1].toLowerCase()], PUBLISHED.length, `the count says ${sentence[1]}`);
  for (const name of PUBLISHED) {
    assert.ok(sentence[2].includes(`\`${name}\``), `the README does not name ${name}`);
  }
});
