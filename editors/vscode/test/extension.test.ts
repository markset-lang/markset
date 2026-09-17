import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseDocument, BLOCK_DIRECTIVE_NAMES } from "@markset-lang/parser";
import {
  buildSnippets,
  check,
  declaresMarkset,
  escapeSnippetBody,
  fenceCompletions,
  previewDocument,
  shouldCheck,
  unescapeSnippetBody,
  type SnippetCase,
} from "../src/core.ts";
import { buildExtension } from "../build.ts";

const here = import.meta.dirname;
const root = join(here, "..", "..", "..");

async function loadCases(): Promise<Record<string, SnippetCase[]>> {
  const dir = join(root, "tests");
  const cases: Record<string, SnippetCase[]> = {};
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    cases[basename(file, ".json")] = JSON.parse(await readFile(join(dir, file), "utf8"));
  }
  return cases;
}

test("a document is checked when its frontmatter declares markset, and otherwise only on request", () => {
  // Every Markdown file is valid Markset, but a reader whose `:::` means
  // something else never opted into a closed vocabulary. The frontmatter key is
  // the trigger §6 names, and a wrong version still counts so its diagnostic
  // can be shown.
  assert.equal(declaresMarkset("---\nmarkset: 0\n---\n\n# Hi\n"), true);
  assert.equal(declaresMarkset("---\ntitle: x\nmarkset: 1\n---\n"), true);
  assert.equal(declaresMarkset("---\ntitle: x\n---\n\nmarkset: 0\n"), false, "a key in the body is prose");
  assert.equal(declaresMarkset("# No frontmatter\n\n:::card\nx\n:::\n"), false);
  assert.equal(shouldCheck("# plain\n", true), true, "the setting checks everything");
  assert.equal(shouldCheck("# plain\n", false), false);
});

test("diagnostics carry the parser's codes and offsets, which the editor turns into ranges", () => {
  const source = "---\nmarkset: 0\n---\n\n:::grdi\n- a\n:::\n";
  const found = check(source);
  const unknown = found.find((d) => d.code === "DIRECTIVE_UNKNOWN_NAME");
  assert.ok(unknown, `expected DIRECTIVE_UNKNOWN_NAME, got ${found.map((d) => d.code).join(", ")}`);
  assert.equal(unknown.severity, "error");
  assert.equal(source.slice(unknown.start, unknown.end), "grdi", "the range is the name, not the whole fence line");
});

test("the preview renders the document with no script and a policy that would block one anyway", () => {
  const page = previewDocument(
    "---\nmarkset: 0\ntheme:\n  preset: report\n---\n\n:::card[Hi]\nx\n:::\n",
    "body{}",
    "p{}",
    "dark",
  );
  assert.doesNotMatch(page, /<script/iu);
  assert.match(page, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:/u);
  assert.match(
    page,
    /<body data-preset="report" data-scheme="dark">/u,
    "theme tokens and the editor's scheme both reach body",
  );
  assert.match(page, /<section class="ms-card" data-tone="neutral">/u);
  assert.match(
    page,
    /<style>\nbody\{\}\n<\/style>\n<style>\np\{\}\n<\/style>/u,
    "default first, theme after, like the CLI",
  );
});

test("every snippet is a conformance case that still parses clean, one per construct and picture", async () => {
  const snippets = buildSnippets(await loadCases());
  const prefixes = Object.values(snippets)
    .map((s) => s.prefix)
    .sort();
  assert.deepEqual(prefixes, [...BLOCK_DIRECTIVE_NAMES, "callout", "chart", "diagram"].sort());
  for (const [key, snippet] of Object.entries(snippets)) {
    const source = unescapeSnippetBody(snippet.body.join("\n"));
    const { diagnostics } = parseDocument(`${source}\n`);
    assert.deepEqual(
      diagnostics.filter((d) => d.severity === "error"),
      [],
      `${key} would insert a document the parser rejects`,
    );
    assert.ok(snippet.description.length > 0, `${key} has no description`);
  }
});

test("snippet bodies escape what VS Code would otherwise interpret", () => {
  assert.equal(escapeSnippetBody("cost $4 and a \\ slash"), "cost \\$4 and a \\\\ slash");
  const tricky = ["$", "{1:x} \\$ \\\\"].join("");
  assert.equal(unescapeSnippetBody(escapeSnippetBody(tricky)), tricky);
});

test("after ::: every fenced construct is offered, and the callout is not, because it is a blockquote", async () => {
  const offered = fenceCompletions(buildSnippets(await loadCases()))
    .map((c) => c.name)
    .sort();
  assert.deepEqual(offered, [...BLOCK_DIRECTIVE_NAMES].filter((n) => n !== "callout").sort());
});

test("the grammar is valid JSON that injects into markdown, and every pattern compiles", async () => {
  const grammar = JSON.parse(await readFile(join(here, "..", "syntaxes", "markset.injection.json"), "utf8")) as {
    scopeName: string;
    injectionSelector: string;
    repository: Record<string, { match?: string; patterns?: Array<{ match?: string }> }>;
  };
  const manifest = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")) as {
    contributes: { grammars: Array<{ scopeName: string; injectTo: string[]; path: string }> };
  };
  assert.equal(manifest.contributes.grammars[0].scopeName, grammar.scopeName);
  assert.deepEqual(manifest.contributes.grammars[0].injectTo, ["text.html.markdown"]);
  assert.match(
    grammar.injectionSelector,
    /^L:text\.html\.markdown/u,
    "left injection, so fence lines beat the paragraph rule",
  );
  for (const [name, rule] of Object.entries(grammar.repository)) {
    for (const match of [rule.match, ...(rule.patterns ?? []).map((p) => p.match)]) {
      if (match) assert.doesNotThrow(() => new RegExp(match, "u"), `${name} does not compile as a regular expression`);
    }
  }
  // The rules recognize what the spec spells, and leave a link alone.
  const open = new RegExp(grammar.repository["directive-open"].match ?? "", "u");
  assert.ok(open.test(":::card[Pricing]{tone=info}"));
  assert.ok(open.test('::::columns{ratio="2:1"}'));
  assert.ok(!open.test(":::"), "a bare fence is the close rule's");
  const span = new RegExp(grammar.repository.span.match ?? "", "u");
  assert.ok(span.test("[Beta]{.badge}"));
  assert.ok(!span.test("[a link](https://example.com)"));
});

test("every command the manifest contributes is registered, and the engine matches the typings", async () => {
  const manifest = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")) as {
    version: string;
    engines: { vscode: string };
    contributes: { commands: Array<{ command: string }> };
    main: string;
  };
  const source = await readFile(join(here, "..", "src", "extension.ts"), "utf8");
  for (const { command } of manifest.contributes.commands) {
    assert.ok(source.includes(`registerCommand("${command}"`), `${command} is contributed but never registered`);
  }
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
    devDependencies: Record<string, string>;
  };
  // vsce refuses a typings version newer than the engine, so the two are held
  // to the same minor here rather than discovered at packaging time.
  const types = rootPkg.devDependencies["@types/vscode"].replace(/^[\^~]/u, "");
  assert.equal(manifest.engines.vscode, `^${types}`);
  assert.equal(manifest.main, "./dist/extension.cjs");
});

test("the extension bundles: one CommonJS file, vscode left external, and the files it reads beside it", async () => {
  const out = await mkdtemp(join(tmpdir(), "markset-vscode-"));
  try {
    const written = await buildExtension(out);
    const names = (await readdir(out)).sort();
    assert.deepEqual(names, ["extension.cjs", "extension.cjs.map", "markset.css", "snippets.json"]);
    assert.equal(written.length, 4);
    const js = await readFile(join(out, "extension.cjs"), "utf8");
    assert.match(js, /require\("vscode"\)/u, "the host provides vscode; it must not be bundled");
    assert.doesNotMatch(js, /import\.meta/u, "CommonJS has no import.meta, and the host loads CommonJS");
    assert.match(js, /ms-card/u, "the renderer is in the bundle");
    const css = await readFile(join(out, "markset.css"), "utf8");
    assert.match(css, /\.ms-document/u);
    JSON.parse(await readFile(join(out, "snippets.json"), "utf8"));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("the bundle activates against a stub host without throwing, and registers what the manifest promises", async () => {
  // The one path no other test here can reach is activate() itself, and it is
  // where a missing dist file or a host API used at load time would surface --
  // as a notification the reader has to report, since nothing in this
  // repository runs an editor. So a stub host stands in: every member activate
  // touches returns a disposable or a value of the right shape, and the test
  // asserts the side effects the manifest describes.
  const out = await mkdtemp(join(tmpdir(), "markset-vscode-"));
  try {
    await buildExtension(out);
    const disposable = { dispose(): void {} };
    const event = () => disposable;
    const registered: string[] = [];
    const statusBar = {
      text: "",
      tooltip: "",
      command: "",
      shown: false,
      show(): void {
        this.shown = true;
      },
      hide(): void {
        this.shown = false;
      },
      dispose(): void {},
    };
    const stub = {
      Uri: { parse: (s: string) => ({ toString: () => s }) },
      Range: class {},
      Diagnostic: class {},
      DiagnosticSeverity: { Error: 0, Warning: 1 },
      ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
      StatusBarAlignment: { Left: 1, Right: 2 },
      CompletionItem: class {},
      CompletionItemKind: { Snippet: 0, Keyword: 1 },
      SnippetString: class {},
      MarkdownString: class {},
      ViewColumn: { Beside: -2 },
      languages: {
        createDiagnosticCollection: () => ({ set(): void {}, delete(): void {}, dispose(): void {} }),
        registerCompletionItemProvider: () => disposable,
      },
      workspace: {
        textDocuments: [],
        getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
        onDidOpenTextDocument: event,
        onDidChangeTextDocument: event,
        onDidCloseTextDocument: event,
        onDidChangeConfiguration: event,
      },
      window: {
        activeTextEditor: undefined,
        activeColorTheme: { kind: 1 },
        createStatusBarItem: () => statusBar,
        onDidChangeActiveTextEditor: event,
        onDidChangeActiveColorTheme: event,
      },
      commands: {
        registerCommand: (id: string) => {
          registered.push(id);
          return disposable;
        },
      },
    };
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const Module = require("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
    const load = Module._load;
    Module._load = function (request: string, ...rest: unknown[]) {
      return request === "vscode" ? stub : load.call(this, request, ...rest);
    };
    try {
      const context = { extensionPath: join(out, ".."), subscriptions: [] as unknown[] };
      // dist/ is read relative to the extension root, so the temporary dir is
      // the dist and its parent stands in for the root.
      const { rename, mkdir: mk } = await import("node:fs/promises");
      const fakeRoot = await mkdtemp(join(tmpdir(), "markset-vscode-root-"));
      await mk(join(fakeRoot, "dist"), { recursive: true });
      for (const f of ["extension.cjs", "markset.css", "snippets.json"])
        await rename(join(out, f), join(fakeRoot, "dist", f));
      context.extensionPath = fakeRoot;
      const loaded = require(join(fakeRoot, "dist", "extension.cjs")) as {
        activate: (context: { extensionPath: string; subscriptions: unknown[] }) => void;
      };
      loaded.activate(context);
      const manifest = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")) as {
        contributes: { commands: Array<{ command: string }> };
      };
      assert.deepEqual(registered.sort(), manifest.contributes.commands.map((c) => c.command).sort());
      assert.ok(context.subscriptions.length > 5, "activation registers its listeners for disposal");
      assert.equal(statusBar.command, "markset.openPreview", "the status bar item opens the preview");
      assert.equal(statusBar.shown, false, "and stays hidden with no Markset file active");
      await rm(fakeRoot, { recursive: true, force: true });
    } finally {
      Module._load = load;
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
