# @markset-lang/cli

The `markset` command: check a [Markset](https://markset.org/) document, render it to HTML or plain CommonMark, print its AST, or emit the default stylesheet.

```sh
npm i -g @markset-lang/cli
# or
pnpm add -g @markset-lang/cli
markset check docs/*.md
markset html README.md -o index.html
```

Markset is a strict superset of CommonMark with a closed vocabulary of layout constructs — cards, grids, columns, tabs, steps, metrics, figures, callouts — so every Markdown file you already have is a valid input.

## Commands

| Command | What it does |
|---|---|
| `check <file...>` | Report diagnostics. Exit code 1 when any is an error, so it works as a CI gate. |
| `html <file>` | Render a complete HTML page with the default stylesheet inlined. |
| `downgrade <file>` | Render plain CommonMark, the form for a target that has never heard of Markset (spec §3). |
| `ast <file>` | Print the AST as JSON — mdast plus the construct nodes. |
| `css` | Write the default stylesheet, for a site that links it once instead of inlining it into every page. |
| `guide` | Write the authoring guide: how to write Markset well, for a coding agent or a person. |

`-` as the file reads standard input. Every command exits 0, 1 or 2: 0 when nothing is wrong, 1 when `check`
finds an error in a document, and 2 when the invocation is wrong (an unknown command or flag, or a file that is not
there). `markset --version` prints the version.

## Writing with an agent

Most documents are drafted by an agent now, and `guide.md` in this package is what an agent needs to write Markset
well: the eight constructs with an example of each, when each earns its place and when it does not, the classes, the
rules that keep a document portable, and the codes `check` reports. Point your agent at it with one line, in CLAUDE.md:

```text
@node_modules/@markset-lang/cli/guide.md
```

or in AGENTS.md: `Before writing a Markset document, read node_modules/@markset-lang/cli/guide.md and follow it.`
With the CLI installed as a dev dependency the guide stays in step with the version you run. `markset guide -o
MARKSET.md` writes a copy instead, for a repository that does not install it.

The loop is the guide, then `markset check`, which the guide tells the agent to run and clean before it finishes.
Every example in the guide is parsed by this package's tests, so it never teaches what the checker rejects.

## Options

```
-o, --out <path>       write output to a file instead of stdout
--fragment             html: emit only the body fragment, no <html> or stylesheet
--css <mode>           html: inline (default) | none | <href to link>
--theme <file>         html: append a theme stylesheet after the default (spec §6)
--diagram <spec>       html: diagram fences (spec §10); repeatable
--chart <spec>         html: draw a figure's table as a chart (spec §11); "none" to draw none
--title <text>         html: page title (default: the first level-one heading)
--json                 check: emit diagnostics as JSON
--positions            ast: keep position fields
```

## Checking

A closed vocabulary is only worth having if the diagnostics are part of it. `check` reports every one the spec defines, with a line and column:

```
$ markset check notes.md
notes.md:14:1: error DIRECTIVE_UNKNOWN_NAME unknown directive "grdi"
notes.md:31:1: warning COLUMNS_SINGLE columns with no ::col
2 diagnostic(s), 1 error(s) in 1 file(s)
```

With `--json` the same report is an array of objects, each carrying `file`, `line`, `column`, `code`, `severity`, `message`, and the `start` and `end` character offsets. That is what an editor integration or a lint step consumes.

## Themes

A document names roles, never appearance: `{.lead}`, `[Beta]{.badge}`, `:::card{tone=info}`. What a role looks like is a stylesheet's decision, and the stylesheet is chosen where the document is rendered, so the document stays portable:

```sh
markset html report.md --theme brand.css -o report.html
```

The theme is emitted after the default stylesheet so it can restyle constructs and override tokens. Without it the document still renders acceptably, because the constructs are styled by the default and unknown classes are inert.

## Diagrams and charts

A fenced code block whose info string names `ascii`, inside a captioned `figure`, is drawn as an SVG by default. Other languages are opt-in, and the fence reaches the command on standard input, never interpolated into a shell:

```sh
markset html doc.md --diagram mermaid="mmdc -i /dev/stdin -o /dev/stdout"
markset html doc.md --diagram none
```

A `figure` with `chart=line`, `bar` or `column` around a table is drawn as a chart, in front of the table rather than instead of it. `--chart none` turns that off.

Nothing in a Markset file can cause anything to run. Only the operator's flags name a command.

## Library

Everything the CLI does is available as a function: `@markset-lang/parser` for `parseDocument`, `@markset-lang/render-html` for `renderHtml` and `renderPage`, `@markset-lang/render-downgrade` for `downgrade`. This package is the command-line wrapper around them and nothing more.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
