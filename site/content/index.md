---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

# Markdown for rich documents, without leaving Markdown

[Release candidate]{.badge .info} [v0.0.0-rc.1]{.badge}

{.lead}
Markset adds a small, closed vocabulary of layout constructs to CommonMark: cards, grids, columns, tabs, steps, metrics, figures, callouts, and a theme token model. Every valid CommonMark document is a valid Markset document. Every Markset construct degrades to plain CommonMark by rule.

:::grid{cols=3}
- **Semantic, never presentational.** Authors name intent; themes decide appearance. No inline CSS, no pixel values in source.
- **Every construct degrades.** Each one wraps a CommonMark primitive and has a defined fallback. Paste a Markset file into a GitHub comment and it still reads.
- **Closed vocabulary.** Unknown directives are errors, not silent passthrough. Documents are checkable, and generated output is reliable.
:::

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

Rendered with `markset html`, the table becomes metric tiles with a direction on each delta. Run through `markset downgrade`, or pasted anywhere that has never heard of Markset, it is the table, unchanged.

> [!NOTE]
> **Nothing here executes.** Interactivity is permanently out of scope for the core spec. Tabs switch with radio inputs, callouts fold with `<details>`, and a document is data, not code.

## Reuse, don't invent

The syntax is the convergent one: attribute specifiers `{#id .class key=value}`, fenced directives `:::name`, and bracketed spans `[text]{.class}` already exist in Pandoc, djot, MyST, and remark-directive. Callouts use GitHub's `> [!NOTE]` unchanged. What none of those projects provide is a portable component vocabulary that multiple renderers agree on. That vocabulary is what Markset is.

:::steps
1. Read the [guide](guide/index.html) for one page per construct, with live examples pulled from the conformance suite.
2. Read the [specification](spec/index.html). It is short, and it is the source of truth.
3. Browse the [conformance suite](conformance/index.html): every case rendered live by the reference implementation.
:::

:::card[Try it locally]{tone=info}
```sh
git clone https://github.com/markset-lang/markset && cd markset
npm install
node packages/cli/src/markset.ts html examples/showcase.md -o showcase.html
```
:::
