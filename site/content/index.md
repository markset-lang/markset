---
markset: 0
theme:
  preset: technical
---

::::::columns{.hero ratio="11:9"}
{.eyebrow}
Markdown, with layout

# Rich documents, without leaving Markdown

{.lead}
Cards, grids, tabs, metrics and callouts, written as plain Markdown. A Markset file is still a Markdown file, and reads as one wherever Markset is not supported.

[[Open the playground](playground/index.html)]{.button .primary} [[Get started](start/index.html)]{.button}

[v0]{.badge .success} [0.3.4]{.badge} [CommonMark superset]{.badge}

::col

:::::card{.demo}
{.eyebrow}
Markdown source → rendered layout

```markdown
:::metrics
| Metric  | Value | Δ     |
|---------|-------|-------|
| Revenue | $4.2M | +12%  |
| Churn   | 2.1%  | -0.4% |
:::
```

:::metrics
| Metric  | Value | Δ     |
|---------|-------|-------|
| Revenue | $4.2M | +12%  |
| Churn   | 2.1%  | -0.4% |
:::
:::::
::::::

:::metrics{.stats}
| Measure | Count |
|---|---|
| Layout constructs | {{constructs}} |
| Test cases | {{cases}} |
| JavaScript in the output | None |
:::

The example above is the whole idea: a Markdown table in a fence that names what it is. Rendered, it becomes metric tiles. Anywhere else, it is the same table. The construct adds meaning without taking the content hostage.

{.eyebrow}
Tools

## Where you can use it

:::grid{cols=3 .tiles}
- **In VS Code**

  The Markdown preview you already use renders the layout, every construct is offered after `:::`, and a mistake is underlined as you type.

  [[Set up the extension](editor/index.html)]{.button .small}

- **In your own app**

  A TipTap editor for people who should never see the syntax. Saving writes Markset back and changes only the lines they edited.

  [[Try the editor](tiptap/index.html)]{.button .small}

- **In your browser**

  The playground runs the parser and both renderers on your machine: the page, its HTML, the plain-Markdown fallback and the diagnostics.

  [[Open the playground](playground/index.html)]{.button .small}

- **From the command line**

  Check a document, render it to HTML, lower it to plain CommonMark, or print its tree. One command, no configuration file.

  [[The markset command](cli/index.html)]{.button .small}

- **In a remark pipeline**

  Add Markset to the Astro, Next or Eleventy build you already run, as one remark plugin, without replacing anything around it.

  [[On npm](https://www.npmjs.com/package/@markset-lang/remark-markset)]{.button .small}

- **On GitHub Pages**

  Publish a folder of Markset documents as a site with one workflow file. This site is built that way.

  [[The recipe](github-pages/index.html)]{.button .small}
:::

:::::card{.band}
{.eyebrow}
Principles

## Three rules it does not bend

:::grid{cols=3}
- **Semantic, never presentational**

  Authors name what a thing is, not how it looks. The theme decides whether a card has a border.

- **Every construct degrades**

  Each one wraps an ordinary Markdown block and has a defined fallback. Paste a file into a GitHub comment and it still reads.

- **Closed vocabulary**

  Eight constructs, and an unknown one is a reported error rather than silent passthrough, so a document can be checked before it ships.
:::

[Why Markset exists](why/index.html), and how it compares with Pandoc, Quarto, MyST, Markdoc and MDX.
:::::

{.eyebrow}
Next

## Read further

:::grid{cols=3}
- **The reference**

  A page per construct, with live examples taken from the test suite.

  [Read the reference](reference/index.html)

- **The specification**

  Short, and the source of truth: when the code and the spec disagree, the spec wins.

  [Read the spec](spec/index.html)

- **The examples**

  Complete documents, each with a theme of its own, showing how far appearance moves while the source stays plain.

  [See the examples](examples/index.html)
:::
