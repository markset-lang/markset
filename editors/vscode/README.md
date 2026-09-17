| `markset.builtInPreview` | `true` | Render Markset documents in the built-in Markdown preview. |
| `markset.preview.theme` | `""` |# Markset for Visual Studio Code

[Markset](https://markset.org/) is Markdown with a small, closed vocabulary of layout constructs — cards, grids, columns, tabs, steps, metrics, figures, callouts — and every valid Markdown file is already a valid Markset document. This extension is the reference implementation running inside the editor.

## What it does

- **Diagnostics as you type.** The parser's own validation, with a line and column: an unknown directive is an error, a `grid` holding something other than a list is an error, a `columns` with one column is a warning. Each carries its spec code and a link to the specification.
- **The built-in Markdown preview renders Markset.** Click the standard preview icon on a file that declares `markset:` and you see cards, grids and tabs rather than fence lines, because the extension hands the built-in preview this implementation's rendering through the `markdown.markdownItPlugins` extension point. Every other Markdown file is left exactly as it was. `markset.builtInPreview` turns it off.
- **A Markset preview of its own** on command, beside the editor: run *Markset: Open Preview to the Side* from the Command Palette, click the eye icon in the editor title, or click **Markset** in the status bar, which appears whenever a Markset file is active. It is rendered by the same renderer and stylesheet the `markset` command uses, follows the editor's light or dark theme, and updates as you type. The preview has scripting switched off, because a rendered Markset document never contains a script, and this is where that is a property of the page rather than a claim.
- **Plain CommonMark on demand.** *Markset: Show as Plain CommonMark* opens the downgraded form — what the document becomes on a target that has never heard of Markset — so you can see what a reader on GitHub sees.
- **Completions.** Type `:::` at the start of a line and every fenced construct is offered with a working example; type `> [!` and the five callout types are.
- **Snippets.** `card`, `grid`, `tabs`, `figure`, `diagram`, `chart` and the rest. Every body is a case from the Markset conformance suite, so a snippet can never insert something the parser rejects.
- **Highlighting** for fence lines, `::col`, attribute lines, bracketed spans and callout markers, layered over the Markdown grammar you already have.

## Which files it checks

A Markset document carries a `markset:` line in its frontmatter naming the specification version it is written against — `markset: 0` for v0, the current one. That is a version number, not a switch: zero does not mean off, it means the zeroth specification, the way `openapi: 3.0` names a version rather than a setting. By default only files with that line are checked. Everything else is Markdown, and a `:::` in it may mean something else entirely. Set `markset.checkAllMarkdown` to check every Markdown file.

## Settings

| Setting | Default | What |
|---|---|---|
| `markset.checkAllMarkdown` | `false` | Report diagnostics on every Markdown file, not only those with a `markset:` version line. |
| `markset.preview.theme` | `""` | A theme stylesheet (spec §6) appended after the default in the preview. Relative to the workspace folder. |

## Commands

| Command | What |
|---|---|
| Markset: Open Preview to the Side | Also the preview icon in the editor title of any Markdown file. |
| Markset: Show as Plain CommonMark | The downgraded document in a new editor. |

## Installing from source

The extension is built from the [Markset repository](https://github.com/markset-lang/markset):

```sh
npm install
npm run vscode:package
code --install-extension editors/vscode/markset-vscode-*.vsix
```

The bundle is built from the repository's sources, so what the editor runs is exactly what the tests ran.

MIT.
