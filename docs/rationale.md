---
title: Expanding Markdown for Rich Document Layout
subtitle: Capability gap analysis, prior art, and a proposed syntax
date: 2026-09-13
---

# Expanding Markdown for Rich Document Layout

## 0. Where this started

Markset started with two things I did not want to give up.

Documents rendered as Claude artifacts were the best-looking documents I had ever had produced for me. Cards, metric strips, columns, tabs and callouts appeared where they helped and nowhere else, and the result read like something a designer had laid out. They were also HTML, often React and Tailwind: a wall of markup that could not be edited without care, could not be reviewed in a diff, and could not be carried to any other tool or target. A week later, changing one sentence in one of them meant finding it inside the markup.

Markdown is the opposite in every respect. It is plain text, it diffs, it renders everywhere, and it stays correct because there is so little of it to get wrong. And it has no way to say "these three things belong side by side," or "this number is the one that matters," or "these steps are a procedure." Everyone who has wanted that has reached for raw HTML, which gives up exactly what made Markdown worth using.

So the question this document set out to answer was narrow: which small set of layout ideas makes those artifacts feel rich, and could that set be added to Markdown as a fixed vocabulary rather than an escape hatch, so that the document stays plain text and every renderer agrees on what it means? The analysis below is the answer. The nine example documents in the repository were the test: each was an artifact first, rebuilt in Markset to find out whether the vocabulary could carry it. It could, and the places where it could not are recorded in `future-requirements.md` and, where they warranted it, in the specification.

## 1. What Claude artifacts actually do

It's worth being precise about the baseline, because it reframes the problem.

A Claude artifact isn't a rich Markdown renderer. It's an HTML/CSS/JS (often React + Tailwind) surface. The expressive ceiling is "the web," which is unbounded. So the question isn't *how do we match artifacts* — you can't beat arbitrary HTML with a lightweight syntax, and you shouldn't try.

The useful question is: **which small, recurring set of layout patterns makes artifacts feel rich?** In practice it's a short list:

| Pattern | What it does |
|---|---|
| Cards / surfaces | Bordered, tinted, elevated containers that group content |
| Grids & columns | Side-by-side content, 2–4 column feature grids |
| Callouts | Tinted, iconed advisory blocks with a title |
| Stat / metric blocks | Big number, label, delta indicator |
| Badges & pills | Inline status color: `Beta`, `Deprecated`, `v2.1` |
| Tabs & accordions | Progressive disclosure, per-platform variants |
| Steps / timelines | Numbered or dated vertical sequences |
| Typographic hierarchy | Lead paragraphs, small print, eyebrows, pull quotes |
| Figures | Sized images with captions, aspect control, side-by-side |
| Charts | Data rendered as a visualization, not an image |
| Design tokens | A coherent palette, type scale, spacing rhythm |
| Interactivity | Sliders, filters, sortable tables, live calculation |

Roughly the first eleven are *static layout and presentation*. Only the last is genuinely dynamic. That split matters enormously for scoping the project: the first eleven are achievable in a declarative markup language with zero code execution. The last one is not, and chasing it is how projects like this turn into MDX.

## 2. What CommonMark and GFM cannot express

Markdown's block vocabulary is fixed: paragraph, heading, list, blockquote, code, thematic break, table (GFM), plus inline emphasis, code, link, image. There is no extension point. Concretely, the gaps:

**No attribute mechanism.** This is the root problem. There is no way to attach an id, class, or key/value to *any* node. Every other gap downstream of this one exists because there's no styling hook.

**No generic container.** Nothing wraps a sequence of blocks into a labeled region. Blockquote is the only container, which is why every ecosystem has ended up abusing it for callouts.

**No layout axis.** Markdown is a strictly linear single-column stream. Columns, grids, side-by-side, margin/aside content, and float are all unrepresentable.

**No semantic color or status.** Bold and italic are the entire emphasis palette. Nothing expresses "this is a warning," "this is deprecated," "this is a positive delta."

**Impoverished tables.** GFM pipe tables have no colspan/rowspan, no captions, no column widths, no cell-level formatting, no grouping, no footers.

**No figures.** Images have alt text and an optional title, but no caption, no width/height, no aspect ratio, no gallery.

**No data visualization.** Charts must be pre-rendered images, which breaks the plain-text source-of-truth property.

**No document-level design intent.** Frontmatter is by convention metadata, not theming. There's no standard way to say "this document uses this palette and this type scale."

**No cross-reference or numbering system.** No auto-numbered figures/tables/sections, no `see Figure 3` resolution.

**No progressive disclosure.** No tabs, no accordions, no collapsible regions (`<details>` requires raw HTML).

**No print/page model.** No page breaks, running headers, or page-level layout.

The escape hatch has always been raw HTML, and it's a bad one: it breaks in non-HTML output targets, it's unsafe in multi-author contexts, it's verbose, it doesn't diff well, and most sanitizing renderers strip it.

## 3. Prior art — most of this already exists

This is the part worth internalizing before writing any code. The syntax problem is substantially solved; the ecosystem problem is not.

### The convergent syntax

Three constructs appear again and again, invented largely independently and now clearly converging:

1. **Attribute specifiers** — `{#id .class key=value}` — Pandoc, djot, Kramdown, `markdown-it-attrs`, PHP Markdown Extra.
2. **Fenced divs** — `::: {.class}` … `:::` — Pandoc, Quarto, Docusaurus, VitePress.
3. **Generic directives** — `:::name[argument]{attrs}` for blocks, `:name[text]{attrs}` inline — the CommonMark "generic directives" proposal, implemented by `remark-directive`; MyST's `{directive}` / `{role}` pair is the same idea with different spelling.

If you build anything, build on these. Inventing a fourth spelling is the single most likely way to make the project irrelevant.

### The landscape

**Pandoc Markdown** — the deepest static implementation. Fenced divs, bracketed spans, attributes everywhere, grid tables with spans, figures, citations, cross-references, and dozens of output targets. Weakness: no component vocabulary or theming story; you get a `<div class="foo">` and are on your own for CSS.

**Quarto** — closest existing thing to your vision. Built on Pandoc, adds callouts (`.callout-note`), Bootstrap CSS Grid layout via `::: {.grid}` / `::: {.g-col-4}`, panel layouts, margin columns, tabsets, cross-references, and renders to HTML, PDF, LaTeX, and Typst from one source. If your goal is rich documents rather than a new format, evaluate this first and seriously.

**MyST** — CommonMark superset with directives and roles, a published AST spec built on mdast/unist, and a test suite. Strong on scientific/publication semantics (figures, equations, citations, admonitions, tabs). Weaker on visual design and general-purpose layout.

**Djot** — John MacFarlane's clean-slate successor to CommonMark. Fixes parsing ambiguity, has attributes and divs as first-class native syntax rather than extensions, plus built-in highlight/insert/delete/spans and smart typography. Small but real ecosystem (JS reference implementation, Haskell, Go, PHP, Markdig experimental, tree-sitter grammar). The best *foundation* if you want a clean base. No component vocabulary — that layer is yours to define.

**MDX** — Markdown plus literal JSX. Maximum power, and the default for Docusaurus/Next/Astro docs. Costs: couples content to React, requires a JS runtime, no static validation, notably slow builds at scale, and content becomes code.

**Markdoc (Stripe)** — `{% tag attr="v" %}` syntax with schema-validated, typed tags and strict content/code separation. Renders to HTML or React from the same tree. Faster than MDX and statically validatable. The schema idea is the most transferable thing here, especially if LLMs are generating the content.

**AsciiDoc** — already has nearly everything on the gap list natively: block attributes, roles, admonitions, tables with spans, includes, cross-references, callouts, multiple backends. It is genuinely the "expanded Markdown" that already exists. Its problem is adoption inertia and heavier syntax, not capability.

**GFM alerts / Obsidian callouts** — `> [!NOTE]`. The most widely rendered callout syntax by raw install count. Obsidian's superset adds custom titles and fold indicators (`[!info]-`). Worth adopting verbatim rather than competing with.

**Observable Framework** — markdown with `grid`/`card` CSS classes and live JS, oriented at dashboards. A good reference for what a card/grid vocabulary feels like in practice.

**Others worth knowing:** reStructuredText/Sphinx (the origin of directives), Typst (not Markdown, but the modern answer to typeset output and a Quarto backend), Marp and Slidev (Markdown → presentation layout), VitePress/Docusaurus containers.

### The actual unsolved problem

Every one of these formats can *express* a callout. None of them agree on how, and none degrade into each other. A recent survey of callout syntax across platforms found the pattern is uniform: each platform's callout syntax is invisible to every other platform's renderer, and none of them error — they silently degrade to plain Markdown with the raw syntax characters showing.

So the gap isn't syntax. **It's the absence of a standard component vocabulary and theme model that multiple renderers agree on.** That is the project worth doing.

## 4. Proposed design

### Principles

1. **Superset of CommonMark.** Every valid CommonMark document is valid input.
2. **Reuse the convergent syntax.** Directives and attribute specifiers. No new spellings.
3. **Semantic, not presentational.** Authors write `card`, `callout`, `metric` — never `background: #eef; padding: 12px`. Appearance is a theme concern. This is what keeps output-target portability and keeps LLM generation constrained.
4. **Graceful degradation is a spec requirement, not a nice-to-have.** Every rich block must be built on a Markdown primitive so that a plain renderer produces something readable rather than syntax soup. This is the design constraint that most differentiates the proposal.
5. **Closed vocabulary with a schema.** A validated tag set, Markdoc-style. Unknown tags are a lint error, not silent breakage.
6. **No code execution in the core.** Interactivity is a separate, optional layer.

### Layer 1 — attributes and spans

```markdown
Attach to any block or inline node:

## Installation {#install .no-toc}

[Beta]{.badge .warn} [v2.1]{.badge}

![Architecture](arch.png){width=60% .center caption="Request flow"}
```

### Layer 2 — the block vocabulary

Each construct wraps a Markdown primitive, shown in the "degrades to" column.

| Directive | Degrades to |
|---|---|
| `:::grid` | Bullet list |
| `:::columns` / `:::col` | Sequential sections |
| `:::card[Title]` | Heading + body |
| `> [!NOTE]` | Blockquote |
| `:::tabs` | Headings + sections |
| `:::steps` | Ordered list |
| `:::metrics` | Table |
| `:::timeline` | List |
| ` ```chart ` | Code block showing the raw data |

**Grid** — list items become cards:

```markdown
:::grid{cols=3 gap=md}
- **Fast** — sub-50 ms cold start
- **Small** — 4 kB gzipped
- **Typed** — no `any` in the public API
:::
```

**Columns** — asymmetric layout:

```markdown
:::columns{ratio="2:1"}
::col
The main argument goes here, at full paragraph length.

::col
:::card{tone=muted}
A supporting sidebar.
:::
:::
```

**Callouts** — adopt GFM/Obsidian syntax unchanged, extended with attributes:

```markdown
> [!WARNING] Breaking change in v3
> The `render()` signature changed.

> [!NOTE]- Collapsed by default
> Fold indicator borrowed from Obsidian.
```

**Metrics** — a table with a role:

```markdown
:::metrics
| Metric  | Value  | Δ     |
|---------|--------|-------|
| Revenue | $4.2M  | +12%  |
| Churn   | 2.1%   | -0.4% |
:::
```

**Tabs** — headings become tab labels:

```markdown
:::tabs
### macOS
`brew install foo`

### Windows
`winget install foo`
:::
```

**Charts** — data lives in the source, so the document stays plain text:

```markdown
​```chart{type=line x=month y=revenue title="ARR"}
month,revenue
Jan,120
Feb,145
​```
```

**Typography and page** — `:::lead`, `:::aside` (margin note), `:::figure`, `:::pagebreak`, `[text]{.small}`, `[text]{.eyebrow}`.

### Layer 3 — theme tokens in frontmatter

The piece nothing in the market standardizes. Design intent belongs in the document, expressed as tokens rather than CSS:

```yaml
---
theme:
  preset: editorial        # editorial | technical | deck | report
  accent: "#2563eb"
  tone: warm
  density: comfortable     # compact | comfortable | spacious
  type:
    body: "Source Serif 4"
    heading: "Inter"
    scale: 1.25
  radius: md
---
```

Presets do the heavy lifting; individual tokens override. A document with no `theme` block still renders well, which is the point — richness by default, not by configuration.

### Layer 4 — interactivity (optional, separate spec)

Deliberately out of the core. If you want it, the constrained form is declarative bindings over the document's own data (sortable/filterable tables, a slider bound to a chart parameter) — never arbitrary script. The moment you allow arbitrary JS you've rebuilt MDX and lost portability, validation, and safety.

### Deliverables that would make it real

- **A spec plus a conformance test suite**, in the CommonMark/MyST style. Without tests it's a plugin, not a standard.
- **An AST**, published as JSON Schema, extending mdast. Renderer authors need this more than they need your parser.
- **A tag schema** so tags and attributes validate statically. Critical if LLMs generate the content.
- **Three reference renderers**: HTML/CSS, print (Typst or Paged.js), and a downgrade renderer emitting plain CommonMark. The third is your proof that degradation works.
- **A default stylesheet** that makes the vocabulary look good with zero configuration. Unglamorous and probably the highest-leverage artifact in the whole project.

## 5. Strategic read

Two honest cautions and one strong argument for proceeding.

**Caution 1:** the graveyard of Markdown extensions is large, and its headstones mostly read "great syntax, no renderers." Adoption is a renderer-count problem, not a design problem. Budget accordingly — the spec is maybe 20% of the work.

**Caution 2:** if your actual need is rich documents rather than a new open format, Quarto plus a custom theme gets you ~80% of this today, across HTML, PDF, and Typst. Try to talk yourself out of the project first.

**The argument for it:** the timing is unusually good. Through 2026 there's been an active debate about whether LLM-generated documents should be emitted as HTML rather than Markdown — HTML wins on visual richness and interactivity, Markdown wins decisively on token cost, diffability, portability, and source legibility. That debate exists precisely because the middle ground you're describing doesn't exist. A semantic, constrained, token-efficient vocabulary that renders richly is exactly the thing both camps are working around. A closed tag set with a validating schema is also far easier for a model to emit correctly than freeform Tailwind, and it costs a fraction of the tokens.

That's the pitch, and it's a real one. Position it as *the rich-output format for generated documents* rather than as Markdown 2.0, and it has a constituency on day one.
