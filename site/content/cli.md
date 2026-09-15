---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Reference implementation

# The `markset` command

{.lead}
One executable with four commands. It validates a document, renders it to HTML, lowers it to plain CommonMark, or prints the parsed tree. There is no build step and no configuration file.

{.tick}
***

{.eyebrow}
Getting it

## Running it from a clone

There is no published package yet. Clone the repository and run the entry point directly. Node 22.18 or newer is required, because the source is TypeScript that Node runs by stripping the types.

```sh
git clone https://github.com/markset-lang/markset && cd markset
npm install
node packages/cli/src/markset.ts --help
```

Everything below writes `markset` where you would type that longer path.

{.tick}
***

{.eyebrow}
Commands

## What each one does

:::grid{cols=2}
- ### `markset check`

  Reads one or more documents and reports every diagnostic with a file, line and column. Exits with status 1 if any diagnostic is an error, which is what makes it usable in continuous integration. Add `--json` to get the diagnostics as structured data instead of text.
- ### `markset html`

  Renders a complete HTML page with the default stylesheet inlined, so the output is one self-contained file. Add `--fragment` for the body content alone, `--theme <file>` to append a theme stylesheet, `--title` to set the page title, and `--diagram` to draw diagram fences (spec §10).
- ### `markset downgrade`

  Lowers every construct to the plain CommonMark it is defined to fall back to. The output is a fixed point: downgrading it again changes nothing, and it parses with no diagnostics. This is the degradation contract, executable.
- ### `markset ast`

  Prints the parsed tree as JSON. The tree is mdast plus the Markset node types, so any tool in the unified ecosystem can consume it. Add `--positions` to keep source offsets.
:::

A single `-` in place of a filename reads the document from standard input.

{.tick}
***

{.eyebrow}
Options

## Every flag

:::figure[Options accepted by `markset`. Only `check` takes more than one file.]
| Flag | Applies to | Effect |
|---|---|---|
| `-o`, `--out <path>` | all | Write to a file instead of standard output. |
| `--fragment` | `html` | Emit the body content only, with no page shell or stylesheet. |
| `--css <mode>` | `html` | `inline` inlines the default stylesheet and is the default. `none` omits it. Any other value is treated as a URL and linked. |
| `--theme <file>` | `html` | Append a theme stylesheet after the default one, so it can style author classes and override tokens. See spec §6. |
| `--diagram <spec>` | `html` | Draw diagram code fences. `ascii` uses the built-in drawer; `<lang>=<command>` runs a command with the fence on stdin and SVG on stdout. Repeatable. Only a fence inside a captioned `figure` is drawn, and a drawer that fails leaves the code block in place. See spec §10 and the [diagrams reference](reference/diagrams/index.html). |
| `--title <text>` | `html` | Page title. Defaults to the first level-one heading. |
| `--json` | `check` | Emit diagnostics as JSON rather than as lines of text. |
| `--positions` | `ast` | Keep the `position` field on every node. |
| `-h`, `--help` | all | Print usage and exit. |
:::

{.tick}
***

{.eyebrow}
In practice

## Three things worth knowing

:::steps
1. ### An invalid document still renders

   `check` is the gate, not the renderer. `html` and `downgrade` report diagnostics on standard error and then produce their output anyway, because a document with one bad directive is still mostly a document. Nothing is silently dropped.

2. ### Validation is the point of a closed vocabulary

   A misspelled `:::cards` is an error rather than a passthrough, so it fails in your editor rather than in someone's browser. Run `markset check docs/*.md` in continuous integration and a typo cannot reach a published page.

3. ### The downgrade is how you leave

   Nothing here locks a document in. `markset downgrade` gives back ordinary CommonMark that any renderer on earth handles, which is the same content a viewer that has never heard of Markset would show.
:::

{.tick}
***

:::card[See it work]{tone=info}
```sh
markset check examples/showcase.md
markset html examples/showcase.md -o showcase.html
markset html examples/strategy-read.md --theme examples/memo.css -o memo.html
markset downgrade examples/showcase.md
markset html doc.md --diagram ascii -o doc.html
```
:::
