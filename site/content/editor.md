---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Editor

# Markset in Visual Studio Code

{.lead}
Your Markdown, rendered with its cards, grids and tabs in the preview you already use. Every construct is offered at the cursor, and a mistake is underlined as you type. One install, nothing to configure.

[On the marketplace]{.badge .success} [Free]{.badge} [No scripts in the preview]{.badge}

{.tick}
***

{.eyebrow}
Getting it

## Install it from the marketplace

Search for **Markset** in the Extensions view, or run this from the command palette:

```
ext install markset-lang.markset-vscode
```

The listing is [markset-lang.markset-vscode](https://marketplace.visualstudio.com/items?itemName=markset-lang.markset-vscode). The extension is built from the same packages as the command line tool and this site, so what the editor reports is exactly what `markset check` reports, and what it shows is what `markset html` renders.

{.tick}
***

{.eyebrow}
What it does

## Five things, none of them a setting

:::grid{cols=2}
- ### The preview you already have renders Markset

  Click the standard Markdown preview icon on a file that declares `markset:` and you see cards, grids and tabs rather than fence lines. The extension hands the built-in preview this implementation's rendering, and leaves every other Markdown file exactly as it was.

- ### Diagnostics as you type

  A misspelled `:::cards` is an error rather than markup that quietly passes through, and it is underlined where it happens. Every diagnostic carries its specification code and a link to the spec, so a warning is something you can look up.

- ### Completions and snippets

  Type `:::` at the start of a line and every construct is offered with a working example. Type `> [!` and the five callout types are. Every snippet body is a case from the conformance suite, so a snippet can never insert something the parser rejects.

- ### Plain CommonMark on demand

  *Markset: Show as Plain CommonMark* opens the downgraded document beside yours, which is what a reader on GitHub sees. Worth a look before you publish a document somewhere that has never heard of Markset.
:::

Highlighting comes with it: fence lines, `::col`, attribute lines, bracketed spans and callout markers are colored on top of the Markdown grammar you already use.

> [!NOTE] Nothing in the preview runs
> A rendered Markset document never contains a script, and the extension's own preview has scripting switched off with a content security policy that would block one anyway. Tabs switch with radio inputs and callouts fold with `<details>`, in the editor as everywhere else.

{.tick}
***

{.eyebrow}
Scope

## Which files it checks

A Markset document names the specification version it is written against with `markset: 0` in its frontmatter. That is a version, not a switch. By default only files with that line are checked and rendered as Markset, because every Markdown file is already valid Markset and a reader whose `:::` means something else never opted into a closed vocabulary. The setting `markset.checkAllMarkdown` widens it to every Markdown file.

{.tick}
***

{.eyebrow}
Diagrams

## An ASCII fence is drawn; anything else is your call

An `ascii` fence inside a captioned `figure` is drawn as a picture with nothing configured, in both previews. Every other diagram language stays a code block unless you name a command that draws it, exactly as the command line does with `--diagram`:

```json
"markset.diagrams": { "mermaid": "mmdc -i /dev/stdin -o /dev/stdout -b transparent" }
```

The fence arrives on the command's standard input and the SVG comes back on its output. The first render of a fence shows the code block while the command runs, and the picture takes its place when it is ready. Nothing in a document can name a command; only this setting can.

Without a command for `mermaid`, the built-in preview hands mermaid fences in captioned figures to the *Markdown Preview Mermaid Support* extension when it is installed, which draws them in the browser.

{.tick}
***

{.eyebrow}
Settings

## The whole list

:::figure[Every setting the extension has. The defaults are the recommended values.]
| Setting | Default | What |
|---|---|---|
| `markset.checkAllMarkdown` | `false` | Report diagnostics on every Markdown file, not only those with a `markset:` version line. |
| `markset.builtInPreview` | `true` | Render Markset documents in the built-in Markdown preview. |
| `markset.diagrams` | `{}` | Commands that draw diagram fences, by language. |
| `markset.preview.theme` | `""` | A theme stylesheet appended after the default in the extension's own preview. Relative to the workspace folder. |
:::

{.eyebrow}
Next

## Where to go from here

- The [command line](../cli/index.html) does everything the extension does from a terminal or a build step, which is how a site gets published.
- The [reference](../reference/index.html) is one page per construct, and the completions in the editor are drawn from the same cases it shows.
- The extension's source is in the [repository](https://github.com/markset-lang/markset/tree/main/editors/vscode), beside the packages it bundles.
