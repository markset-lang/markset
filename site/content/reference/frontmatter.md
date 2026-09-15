---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Reference

# Frontmatter and theme tokens

{.lead}
Frontmatter is the only place a Markset document says anything about itself. It is optional, it is short, and it holds exactly two things the parser understands: which version of the specification the file is written against, and a handful of named settings that decide how the document is proportioned. Everything else in it is left alone for whatever else reads the file.

{.tick}
***

{.eyebrow}
The shape

## What a block looks like

A frontmatter block is a YAML map between two `---` lines, and it must be the first thing in the file.

::::columns{ratio="1:1"}
```markdown
---
markset: 0
title: Deployment runbook
theme:
  preset: technical
  accent: "#2563eb"
  density: comfortable
  radius: md
  type:
    body: "Source Serif 4"
    heading: Inter
    scale: 1.25
---

# Deployment
```

::col

:::card[Everything here is optional]{tone=info}
A document with no frontmatter at all is a valid Markset document. So is one with only `markset: 0`.

Every theme token has a default, and a file that sets none of them renders on the default stylesheet's own proportions.
:::
::::

{.tick}
***

{.eyebrow}
Piece one

## The version key

```markdown
markset: 0
```

`markset: 0` declares which version of the specification the file is written against. Two things about it are worth knowing, because both surprise people.

**The parser does not require it.** A file without it still parses as Markset, constructs and all. The key exists so that *tools* can tell a Markset file from an ordinary Markdown file that happens to use `:::` for something else — a linter deciding whether to check a file, a generator deciding whether to run the renderer.

**Any other value is an error.** `markset: 1` is `DOCUMENT_VERSION_UNSUPPORTED`, not a forward-compatible hint. A parser that implements v0 refuses to guess at a version it does not have.

{.tick}
***

{.eyebrow}
Piece two

## Theme tokens

Seven named settings, all under `theme`. There is no eighth, and nothing here takes a CSS value: the point of a token is that it names an intent a stylesheet interprets, so the same document can be rendered by a stylesheet that disagrees with this one.

:::figure[Every theme token, with its allowed values. A value outside the set is an error and the token is left unset; a key that is not in this table is a warning and is ignored.]
| Token | Values | What it decides |
|---|---|---|
| `preset` | `editorial` `technical` `deck` `report` | The overall proportions: reading measure, type scale, spacing |
| `accent` | a hex color, `#rgb` or `#rrggbb` | The one color a document may name |
| `density` | `compact` `comfortable` `spacious` | Spacing and base text size |
| `radius` | `none` `sm` `md` `lg` | How rounded surfaces are |
| `type.body` | a font family name | Body text |
| `type.heading` | a font family name | Headings |
| `type.scale` | a number from 1 to 2 | How much each heading level steps up |
:::

> [!NOTE]
> **`accent` is the exception that proves the rule.** It is the only place a document may write a color, and it exists because a brand color is genuinely the document's business in a way that "make this box blue" is not. Everything else a theme decides, and a tone name like `warn` never resolves to a color in the source.

### What a preset actually changes

A preset is not a skin. It sets the two measures that decide the document's shape — prose runs to the first, layout constructs and tables run to the second — along with the type scale and spacing.

:::figure[What each preset sets on the default stylesheet. A second implementation is free to choose different numbers; what it may not do is invent a fifth preset.]
| Preset | Prose measure | Wide measure | Character |
|---|---|---|---|
| `editorial` | 44rem | 64rem | Serif body, narrow column, the largest type step |
| `technical` | 60rem | 72rem | The default for documentation: wide prose, tight scale |
| `deck` | 64rem | 80rem | Large base text and generous spacing, for reading at a distance |
| `report` | 56rem | 72rem | Dense spacing and small radii, for something printed |
:::

{.site-note}
The two measures share a left edge rather than being centered on each other, so a grid that runs wider than the paragraph above it still starts in the same place.

{.tick}
***

{.eyebrow}
Piece three

## Everything else in the block

Keys that are not `markset` or `theme` are read and then ignored, with no diagnostic. That is deliberate: your site generator almost certainly wants `title`, `date`, `tags` or `draft`, and Markset has no opinion about any of them.

```markdown
---
markset: 0
title: Deployment runbook      # yours
date: 2026-09-14               # yours
theme:
  preset: technical
  colour: blue                 # warning: not a theme token, ignored
---
```

The one place this does not apply is *inside* `theme`. An unrecognized key there is a warning, because a misspelled token is almost always a mistake rather than somebody else's field.

### The YAML that is supported

The parser reads a deliberate subset rather than depending on a YAML library: block maps, block and flow sequences, quoted and unquoted scalars, numbers, booleans, null, literal and folded block scalars, and comments. Anchors, tags, multi-document streams and flow maps are out of scope, and a flow map is kept as its raw text.

If the block will not parse, you get `FRONTMATTER_UNPARSEABLE` as a warning and the document renders without it, rather than failing.

{.tick}
***

{.eyebrow}
What comes out

## How tokens reach the page

Tokens become attributes and custom properties on `<body>`, and the stylesheet reads them from there. Nothing is inlined into the document body, which is what lets a different stylesheet ignore them.

::::columns{ratio="1:1"}
```markdown
---
markset: 0
theme:
  preset: report
  accent: "#b4501f"
  radius: sm
---
```

::col

```html
<body data-preset="report"
      data-radius="sm"
      style="--ms-accent: #b4501f">
```
::::

A renderer that produces a fragment rather than a page has nowhere to put them; `markset html --fragment` emits the constructs only, and the tokens are yours to apply in your own template.

> [!TIP] There is no token for light or dark
> And there will not be one. Which colors a reader sees is not the document's decision — that is the same rule that keeps pixel values out of the source. The stylesheet follows the reader's system preference, and the chrome around a document can override it with `data-scheme` on `<body>` if it offers a control, the way this site does in its header.

{.tick}
***

{.eyebrow}
Diagnostics

## What can go wrong

:::figure[Every diagnostic frontmatter can produce. Warnings render; the error does not stop rendering either, but it means the file claims a version this parser does not implement.]
| Code | Severity | When |
|---|---|---|
| `FRONTMATTER_UNPARSEABLE` | warning | The block is not readable in the supported YAML subset; `markset` and `theme` are treated as absent |
| `DOCUMENT_VERSION_UNSUPPORTED` | error | `markset` is present with a value other than `0` |
| `THEME_UNKNOWN_TOKEN` | warning | A key under `theme` or `theme.type` that is not in the table; ignored |
| `THEME_INVALID_TOKEN` | error | A token value outside its allowed set; the token is left unset |
:::

Run `markset check` to see them with line numbers before anything renders.

{.tick}
***

{.eyebrow}
The other half

## Theme stylesheets

Tokens cover proportion, not appearance. The classes you invent — `.impact`, `.pull`, `.layer` — mean whatever a stylesheet says they mean, and **no token names that stylesheet**.

That omission is deliberate. A document that pointed at its own stylesheet would render differently depending on whether the file traveled with it, which is the portability failure the whole format exists to avoid. The stylesheet is chosen where the document is rendered:

```sh
markset html report.md --theme corporate.css -o report.html
```

A document still reads without its theme, because the eight constructs are styled by the default stylesheet and unknown classes are simply inert. The three long [examples](../examples/index.html) each carry one, and the difference between them is the clearest picture of how far appearance moves while the source stays the same shape.
