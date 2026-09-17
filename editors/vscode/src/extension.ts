/**
 * The VS Code glue. Thin on purpose: every decision that can be made without
 * the editor is made in core.ts, where node can test it.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import * as vscode from "vscode";
import { downgrade } from "@markset-lang/render-downgrade";
import {
  CALLOUT_TYPES,
  check,
  fenceCompletions,
  previewDocument,
  shouldCheck,
  type Scheme,
  type Snippet,
} from "./core.ts";

const SPEC = vscode.Uri.parse("https://markset.org/spec/");
const DEBOUNCE_MS = 200;

export function activate(context: vscode.ExtensionContext): void {
  const read = (...path: string[]): string => readFileSync(join(context.extensionPath, ...path), "utf8");
  const stylesheet = read("dist", "markset.css");
  const snippets = JSON.parse(read("dist", "snippets.json")) as Record<string, Snippet>;

  // ---- diagnostics ----------------------------------------------------------
  const collection = vscode.languages.createDiagnosticCollection("markset");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== "markdown") return;
    const source = document.getText();
    const checkAll = vscode.workspace.getConfiguration("markset").get<boolean>("checkAllMarkdown", false);
    if (!shouldCheck(source, checkAll)) {
      collection.delete(document.uri);
      return;
    }
    collection.set(
      document.uri,
      check(source).map((d) => {
        const range = new vscode.Range(document.positionAt(d.start), document.positionAt(Math.max(d.end, d.start)));
        const severity = d.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
        const diagnostic = new vscode.Diagnostic(range, d.message, severity);
        diagnostic.source = "markset";
        diagnostic.code = { value: d.code, target: SPEC };
        return diagnostic;
      }),
    );
  };

  const refreshSoon = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
        preview?.update();
      }, DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("markset")) return;
      for (const d of vscode.workspace.textDocuments) refresh(d);
      preview?.update();
    }),
  );
  for (const d of vscode.workspace.textDocuments) refresh(d);

  // ---- preview ----------------------------------------------------------------
  let preview: Preview | undefined;

  class Preview {
    private readonly panel: vscode.WebviewPanel;
    private document: vscode.TextDocument;

    constructor(document: vscode.TextDocument) {
      this.document = document;
      this.panel = vscode.window.createWebviewPanel(
        "markset.preview",
        "Markset Preview",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        // Scripting off. A rendered Markset document carries no script (spec
        // invariant 4), and the preview is where that is a property of the
        // page rather than a promise about it.
        { enableScripts: false, localResourceRoots: [] },
      );
      this.panel.onDidDispose(() => {
        preview = undefined;
      });
      this.update();
    }

    follow(document: vscode.TextDocument): void {
      if (document.languageId !== "markdown" || document === this.document) return;
      this.document = document;
      this.update();
    }

    update(): void {
      const scheme = currentScheme();
      const theme = themeStylesheet(this.document);
      this.panel.title = `Preview: ${basename(this.document)}`;
      this.panel.webview.html = previewDocument(this.document.getText(), stylesheet, theme, scheme);
    }

    reveal(): void {
      this.panel.reveal(undefined, true);
    }
  }

  const basename = (document: vscode.TextDocument): string => document.uri.path.split("/").pop() ?? "document";

  const currentScheme = (): Scheme => {
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast ? "dark" : "light";
  };

  /** The configured theme stylesheet's text, or null when there is none or it cannot be read. */
  const themeStylesheet = (document: vscode.TextDocument): string | null => {
    const setting = vscode.workspace.getConfiguration("markset", document.uri).get<string>("preview.theme", "");
    if (!setting) return null;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const path = isAbsolute(setting) || !folder ? setting : join(folder, setting);
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("markset.openPreview", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document?.languageId !== "markdown") {
        vscode.window.showInformationMessage("Open a Markdown file to preview it as Markset.");
        return;
      }
      if (preview) {
        preview.follow(document);
        preview.reveal();
      } else {
        preview = new Preview(document);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) preview?.follow(editor.document);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => preview?.update()),
  );

  // ---- status bar ---------------------------------------------------------------
  // A visible sign that the extension is awake on this file, and the shortest
  // route to the preview: the editor-title icon sits beside the built-in Markdown
  // preview's and is easy to miss, and a command is easy not to know about.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = "$(eye) Markset";
  status.tooltip = "Open the Markset preview to the side";
  status.command = "markset.openPreview";
  const showStatus = (editor: vscode.TextEditor | undefined): void => {
    const document = editor?.document;
    const checkAll = vscode.workspace.getConfiguration("markset").get<boolean>("checkAllMarkdown", false);
    if (document?.languageId === "markdown" && shouldCheck(document.getText(), checkAll)) status.show();
    else status.hide();
  };
  showStatus(vscode.window.activeTextEditor);
  context.subscriptions.push(
    status,
    vscode.window.onDidChangeActiveTextEditor(showStatus),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) showStatus(vscode.window.activeTextEditor);
    }),
  );

  // ---- downgrade ----------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("markset.showDowngrade", async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document?.languageId !== "markdown") {
        vscode.window.showInformationMessage("Open a Markdown file to see its plain CommonMark form.");
        return;
      }
      const { markdown } = downgrade(document.getText());
      const plain = await vscode.workspace.openTextDocument({ language: "markdown", content: markdown });
      await vscode.window.showTextDocument(plain, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    }),
  );

  // ---- completions ----------------------------------------------------------------
  const fences = fenceCompletions(snippets);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "markdown",
      {
        provideCompletionItems(document, position) {
          const line = document.lineAt(position.line).text.slice(0, position.character);
          const fence = /^(\s{0,3}):{3,}([a-z-]*)$/u.exec(line);
          if (fence) {
            const range = new vscode.Range(position.line, fence[1].length, position.line, position.character);
            return fences.map(({ name, snippet }) => {
              const item = new vscode.CompletionItem(`:::${name}`, vscode.CompletionItemKind.Snippet);
              item.detail = snippet.description;
              item.documentation = new vscode.MarkdownString().appendCodeblock(snippet.body.join("\n"), "markdown");
              item.insertText = new vscode.SnippetString(snippet.body.join("\n"));
              item.range = range;
              item.filterText = `:::${name}`;
              return item;
            });
          }
          const callout = /^(\s{0,3}>\s*)\[!([A-Za-z]*)$/u.exec(line);
          if (callout) {
            const range = new vscode.Range(position.line, callout[1].length, position.line, position.character);
            return CALLOUT_TYPES.map((type) => {
              const item = new vscode.CompletionItem(`[!${type}]`, vscode.CompletionItemKind.Keyword);
              item.insertText = `[!${type}] `;
              item.range = range;
              item.filterText = `[!${type}`;
              return item;
            });
          }
          return undefined;
        },
      },
      ":",
      "!",
    ),
  );
}

export function deactivate(): void {}
