---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Specification · Reference implementation · Conformance suite

# Markdown for rich documents, without leaving Markdown

{.lead}
Markset adds a small, **closed** set of layout constructs to CommonMark: cards, grids, columns, tabs, steps, metrics, figures and callouts. Every valid CommonMark document is already a valid Markset document. Every Markset construct has a defined plain-CommonMark form it falls back to.

[v0]{.badge .success} [0.2.0]{.badge} [CommonMark superset]{.badge}

:::metrics{.stats}
| Measure | Count |
|---|---|
| Layout constructs | 8 |
| Test cases | 361 |
| JavaScript in the output | None |
:::

{.small .muted}
Eight constructs is the whole vocabulary, and it is closed. Every one of them is pinned by cases in a shared test suite, so a second implementation can prove it agrees with this one rather than guessing; you can read every case, including the ones that are invalid on purpose, in the [conformance browser](conformance/index.html). Nothing rendered from a Markset document contains a script, which is why tabs work by radio input and a folding callout is a `<details>` element.

{.tick}
***

{.eyebrow}
Why it exists

## Markdown has no attributes and no generic container

So rich documents reach for raw HTML, and that breaks portability, validation, and every output target that is not a browser. Pandoc, djot, Quarto, MyST, Markdoc and MDX each solved some of the *syntax*. None of them produced a set of components that independent renderers can agree on. That set is what Markset is.

:::grid{cols=3}
- ### Semantic, never presentational

  Authors name what a thing *is*, not how it looks. Whether a card has a border is decided by the theme: a handful of named settings in the document's frontmatter, such as a preset, an accent color and a density. No inline CSS and no pixel values in source.

- ### Every construct degrades

  Each one wraps an ordinary CommonMark block and has a defined fallback. Paste a Markset file into a GitHub comment and it still reads, top to bottom, with nothing lost.

- ### Closed vocabulary

  There are eight constructs and there will not quietly be a ninth. An unknown directive is a reported error, not silent passthrough, so a document can be checked before it ships.
:::

> [!NOTE]
> **Nothing here executes.** Interactivity is out of scope for the core specification, permanently. Tabs switch with radio inputs, callouts fold with `<details>`, and a document is data rather than code. That is what lets the same file render safely anywhere.

{.tick}
***

{.eyebrow}
How it works

## The same source, three ways

::::columns{ratio="1:1"}
```markdown
:::metrics
| Metric  | Value | Δ     |
|---------|-------|-------|
| Revenue | $4.2M | +12%  |
| Churn   | 2.1%  | -0.4% |
:::
```

::col

:::metrics
| Metric  | Value | Δ     |
|---------|-------|-------|
| Revenue | $4.2M | +12%  |
| Churn   | 2.1%  | -0.4% |
:::
::::

On the left is what you write: an ordinary Markdown table, wrapped in a fence that names what it is. On the right is the same source rendered by `markset html`, the command line tool in this repository, which turns it into metric tiles and reads the direction of each delta from its sign.

Run that source through `markset downgrade` instead and you get the table back, unchanged. Paste it into anything that has never heard of Markset and you get the table as well. The construct adds meaning without taking the content hostage.

{.small .muted}
Both commands, and the two others, are described on the [CLI page](cli/index.html). The same trick covers diagrams: an ASCII or mermaid fence is an ordinary code block that a renderer may draw, so a picture needs no construct and no raw HTML — see [diagrams](reference/diagrams/index.html).

{.tick}
***

{.eyebrow}
Prior art

## Reuse, don't invent

The syntax is the convergent one. Attribute specifiers `{#id .class key=value}`, fenced directives `:::name` and bracketed spans `[text]{.class}` already exist across Pandoc, djot, MyST and remark-directive, and callouts use GitHub's `> [!NOTE]` unchanged. Nothing here is a new spelling of an old idea. What is new is the closed set of constructs on top, and the rule that every one of them has a defined plain-CommonMark form.

{.compare}
| Project | Attributes | Generic container | Portable component vocabulary | Document stays inert |
|---|---|---|---|---|
| Pandoc | `{#id .class}` | fenced divs | [None]{.badge} | [Yes]{.badge .success} |
| djot | native | native divs | [None]{.badge} | [Yes]{.badge .success} |
| Quarto | `{.class}` | fenced divs | [Product-specific]{.badge .warn} | [Executes code]{.badge .danger} |
| MyST | directives | directives | [Open and extensible]{.badge .warn} | [Executes code]{.badge .danger} |
| Markdoc | typed tags | typed tags | [Defined per project]{.badge .warn} | [Yes]{.badge .success} |
| MDX | JSX props | JSX | [Your components]{.badge .danger} | [Executes code]{.badge .danger} |
| **Markset** | `{#id .class}` | `:::name` | [Closed and portable]{.badge .success} | [Yes]{.badge .success} |

{.small .muted}
"Portable" means another implementation can render the same document from the specification alone. "Inert" means nothing in a document is evaluated in order to render it.

{.tick}
***

{.eyebrow}
Start here

## Three ways in

:::steps
1. Read the [reference](reference/index.html) for one page per construct, each with live examples pulled straight from the test suite, plus [diagrams](reference/diagrams/index.html) and [frontmatter](reference/frontmatter/index.html).
2. Read the [specification](spec/index.html). It is short, and it is the source of truth: when the code and the spec disagree, the spec wins.
3. Read the [CLI page](cli/index.html) if you would rather start by running something, or go straight to [publishing to GitHub Pages](github-pages/index.html), which is how this site is built.
:::

:::card[Try it locally]{tone=info}
```sh
git clone https://github.com/markset-lang/markset && cd markset
npm install
node packages/cli/src/markset.ts html examples/showcase.md -o showcase.html
```
:::

:::card[See it at length]
Three complete documents, not fragments.

The [construct tour](examples/showcase/index.html) uses every one of the eight constructs exactly once, on the default stylesheet, so you can see the whole vocabulary at its real size.

The [analysis document](examples/notification-routing/index.html) and the [strategy memo](examples/strategy-read/index.html) are long documents of the kind Markset is actually for. Each adds a theme stylesheet of its own, and the difference between the two shows how far appearance can move while the source stays the same shape.
:::
