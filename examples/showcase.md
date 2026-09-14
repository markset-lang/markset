---
markset: 0
title: Markset showcase
theme:
  preset: editorial
  accent: "#2563eb"
  density: comfortable
  radius: md
---

# Markset showcase

[Draft]{.badge .warn} [v0]{.badge}

This document uses every v0 construct once. Paste it into any Markdown viewer and it still reads top to bottom.

> [!NOTE] What you are looking at
> The same source renders as rich HTML with `markset html`, as plain CommonMark with `markset downgrade`, and as itself in a GitHub comment.

## Metrics

:::metrics
| Metric   | Value | Δ     |
|----------|-------|-------|
| Revenue  | $4.2M | +12%  |
| Churn    | 2.1%  | -0.4% |
| Latency  | 48 ms | -6 ms |
:::

## Why a vocabulary

:::grid{cols=3}
- **Semantic** — authors name intent; themes decide appearance.
- **Degrades** — every construct has a defined CommonMark fallback.
- **Closed** — unknown directives are errors, so documents are checkable.
:::

::::columns{ratio="2:1"}
Layout constructs are containers around ordinary Markdown. Nothing here executes; a renderer that has never heard of Markset shows the content in source order.

::col

:::card[Try it]{tone=info}
Run `markset check examples/showcase.md` and then change a directive name to see the diagnostic.
:::
::::

## Install

:::tabs
### macOS
`brew install markset`

### Windows
`winget install markset`

### From source
`npm install` then `node packages/cli/src/markset.ts --help`
:::

## First steps

:::steps
1. Add `markset: 0` to the frontmatter.
2. Wrap a list in `:::grid` and a table in `:::metrics`.
3. Run `markset html` and open the page.
:::

:::figure[Every construct wraps a CommonMark primitive]{#fig-degrade width=80%}
![](degrade.svg)
:::

> [!TIP]- Collapsed by default
> Fold indicators borrow Obsidian's `-` and `+` suffixes and render as `<details>` without JavaScript.
