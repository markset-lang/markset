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
Markset adds a small, **closed** vocabulary of layout constructs to CommonMark: cards, grids, columns, tabs, steps, metrics, figures, callouts, and a theme token model. Every valid CommonMark document is a valid Markset document. Every Markset construct degrades to plain CommonMark by rule.

[Release candidate]{.badge .info} [v0.0.0-rc.1]{.badge} [CommonMark superset]{.badge} [No runtime dependencies]{.badge}

:::metrics{.stats}
| Measure | Count |
|---|---|
| Constructs | 8 |
| Conformance cases | 361 |
| Graded aspects | 1,514 |
| Runtime dependencies | 0 |
:::

{.tick}
***

{.eyebrow}
Why it exists

## Markdown has no attributes and no generic container

So rich documents reach for raw HTML, and that breaks portability, validation, and every output target that is not a browser. Pandoc, djot, Quarto, MyST, Markdoc and MDX each solved some of the *syntax*. None of them produced a component vocabulary that independent renderers can agree on. That vocabulary is what Markset is.

:::grid{cols=3}
- **Semantic, never presentational.** Authors name intent; themes decide appearance. No inline CSS and no pixel values in document source.
- **Every construct degrades.** Each one wraps a CommonMark primitive and has a defined fallback. Paste a Markset file into a GitHub comment and it still reads.
- **Closed vocabulary.** Unknown directives are errors, not silent passthrough. Documents are checkable, so generated output is reliable.
:::

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

Rendered with `markset html`, the table becomes metric tiles with a direction on each delta. Run through `markset downgrade`, or pasted anywhere that has never heard of Markset, it is the table, unchanged. The construct adds meaning without taking the content hostage.

> [!NOTE]
> **Nothing here executes.** Interactivity is permanently out of scope for the core spec. Tabs switch with radio inputs, callouts fold with `<details>`, and a document is data, not code.

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
1. Read the [guide](guide/index.html) for one page per construct, each with live examples pulled straight from the conformance suite.
2. Read the [specification](spec/index.html). It is short, and it is the source of truth: when the code and the spec disagree, the spec wins.
3. Browse the [conformance suite](conformance/index.html), where every case is rendered live by the reference implementation, including the ones that are invalid on purpose.
:::

::::columns{ratio="1:1"}
:::card[Try it locally]{tone=info}
```sh
git clone https://github.com/markset-lang/markset && cd markset
npm install
node packages/cli/src/markset.ts html examples/showcase.md -o showcase.html
```
:::

::col

:::card[See it at length]
Two complete documents, not fragments: a [tour of every construct](examples/showcase/index.html) on the default stylesheet, and a [long analysis document](examples/notification-routing/index.html) that adds a theme stylesheet of its own.
:::
::::
