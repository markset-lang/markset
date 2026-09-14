---
markset: 0
title: Markset showcase
theme:
  preset: technical
  accent: "#2563eb"
  density: comfortable
  radius: md
---

{.eyebrow}
Every construct, once

# A tour of the v0 vocabulary

{.lead}
One document that uses every construct in the specification exactly once, so the whole vocabulary is visible at its real size rather than as isolated snippets. Paste the source into any Markdown viewer and it still reads top to bottom, in order, with nothing lost.

[v0]{.badge .info} [8 constructs]{.badge} [No hand-written HTML]{.badge}

> [!NOTE]
> **What you are looking at.** The same source renders as rich HTML with `markset html`, as plain CommonMark with `markset downgrade`, and as itself in a GitHub comment. Every block below is either a Markset construct or ordinary CommonMark.

{.tick}
***

{.eyebrow}
metrics

## What the suite covers

A table of at least two columns inside `:::metrics` becomes a row of tiles. The first column is the label and the second is the value; an optional third column is read as a delta and takes its direction from the sign.

:::metrics
| Measure | Count |
|---|---|
| Spec sections | 14 |
| Conformance cases | 361 |
| Invalid on purpose | 130 |
| Graded aspects | 1,514 |
:::

{.tick}
***

{.eyebrow}
grid · columns · card

## Containers around ordinary Markdown

`:::grid` takes exactly one list and turns its items into cards. That one-list rule is what makes its downgrade trivially exact: drop the fence and the list is still a list.

:::grid{cols=3}
- **Semantic** — authors name intent, and the theme decides how it looks.
- **Degrades** — every construct has a defined CommonMark fallback.
- **Closed** — unknown directives are errors, so a document is checkable.
:::

`:::columns` divides a region with `::col` separators and takes an optional ratio, the one piece of per-instance geometry in the whole vocabulary. Everything inside is still Markdown, so a renderer that has never heard of Markset shows the content in source order.

::::columns{ratio="2:1"}
The degradation contract in §3 is not aspirational. Each construct has a normative plain-CommonMark form, both forms are covered by the conformance suite, and a mechanical check confirms that a stock CommonMark parser sees the same blocks in the same order.

::col

:::card[Try it]{tone=info}
Run `markset check examples/showcase.md`, change a directive name to `:::widget`, and run it again to read the diagnostic.
:::
::::

{.tick}
***

{.eyebrow}
tabs

## Running it

Tab labels are headings, so a renderer without tab support shows the sections one after another. There is no JavaScript: the panels switch with radio inputs.

:::tabs
### From source
```sh
git clone https://github.com/markset-lang/markset && cd markset
npm install
node packages/cli/src/markset.ts html examples/showcase.md -o showcase.html
```

### As a library
```js
import { parseDocument } from "@markset/parser";
import { renderHtml } from "@markset/render-html";

const { ast, diagnostics } = parseDocument(source);
if (diagnostics.some((d) => d.severity === "error")) throw new Error("invalid document");
const html = renderHtml(ast);
```

### In CI
```sh
node packages/cli/src/markset.ts check docs/*.md
```
:::

{.tick}
***

{.eyebrow}
steps · figure

## Adding it to a document

:::steps
1. Add `markset: 0` to the frontmatter. It declares the spec version, and tools use it to decide that a `.md` file is Markset; the parser itself never requires it.
2. Wrap a list in `:::grid`, or a table in `:::metrics`. Both keep their meaning if the directive is ignored, which is the point.
3. Run `markset check` to validate, then `markset html` to render. Every error the validator reports is specified behavior, not a parser accident.
:::

:::figure[Every construct wraps a CommonMark primitive]{#fig-degrade width=80%}
![Four boxes, each Markset construct pointing at the CommonMark block it wraps](degrade.svg)
:::

> [!TIP]- What the fold indicator does
> A trailing `-` on the callout marker collapses it by default and a `+` expands it, borrowed from Obsidian. It renders as `<details>` and needs no script. On GitHub, where the suffix is not recognized, the callout degrades to a blockquote and keeps its content.

{.small .muted}
Source: `examples/showcase.md`. The document names no stylesheet of its own; that choice belongs to whoever renders it.
