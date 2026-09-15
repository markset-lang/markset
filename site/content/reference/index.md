---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Reference

# Three pieces of syntax, then eight names

{.lead}
Markset does not have much syntax. There are three pieces, and every construct is assembled from them. Once you can read the three, the eight constructs are just names for containers, and the reference for each is a page rather than a chapter.

Each construct page explains when to reach for it, then shows a progression of examples from the canonical form to the awkward corners. Every example is rendered live by the reference implementation beside its source and its plain-CommonMark form, and every one is read from the test suite when the site is built, so a page here cannot disagree with the tests.

{.tick}
***

{.eyebrow}
Piece one

## The attribute specifier

A group in braces that attaches an identifier, classes and typed attributes to whatever it is written on. It is the spelling Pandoc, djot and MyST already use, so it is probably familiar.

```markdown
{#pricing .striped .wide tone=info title="Q3 results"}
```

Four kinds of thing can go inside, in any order, separated by spaces:

:::grid{cols=2}
- ### `#pricing`

  The identifier, which becomes the element's `id`. At most one is meaningful; if you write two, the last wins.

- ### `.striped .wide`

  Classes, kept in the order written. As many as you like. A handful are reserved and work with no theme at all; the rest are yours, and a stylesheet decides what they mean.

- ### `tone=info`

  A typed attribute. Each construct declares which keys it accepts and what values are legal, and an unknown key is reported rather than silently passed through.

- ### `title="Q3 results"`

  The same, quoted, which is how a value carries spaces or a closing brace. Quoting is only special immediately after the `=`.
:::

A specifier never stands alone. It always attaches to something, and there are exactly three things it can attach to.

### On a directive fence

Written straight after the name, or after the bracketed argument if there is one, with no space between them.

::::columns{ratio="1:1"}
```markdown
:::card[Pricing tiers]{tone=info}
Three plans, one page.
:::
```

::col

:::card[Pricing tiers]{tone=info}
Three plans, one page.
:::
::::

### On a bracketed span

Attaches to a run of inline text, which is how a badge or a piece of tone gets into the middle of a sentence.

::::columns{ratio="1:1"}
```markdown
Status: [Draft]{.badge .warn}
and [shipping]{.success}.
```

::col

Status: [Draft]{.badge .warn} and [shipping]{.success}.
::::

### On a line of its own

An *attribute line*: a specifier alone on a line attaches to the block that starts on the very next line. This is how a paragraph, heading, list, table or code block gets attributes, none of which have a place to put them otherwise.

::::columns{ratio="1:1"}
```markdown
{.lead}
The opening paragraph,
set larger.
```

::col

{.lead}
The opening paragraph, set larger.
::::

Two rules are worth knowing. Consecutive attribute lines combine, so you can build up attributes across several lines. And a specifier that opens a list item attaches to the item, which is the only way to single out one card in a grid or one step in a procedure.

{.tick}
***

{.eyebrow}
Piece two

## The block directive

A fence of three or more colons opens a container. A line of at least as many colons, with nothing after them, closes it.

```markdown
:::name[argument]{attributes}
any blocks at all
:::
```

The name is required and must be one of the eight: `card`, `grid`, `columns`, `tabs`, `steps`, `metrics`, `figure`. The bracketed argument and the attribute specifier are both optional, and what the argument means is the construct's business: for a card it is the title, for a figure the caption. A name that is not in the list is an error, not something passed through to the output, which is the whole point of a closed vocabulary.

Content is parsed as ordinary blocks, so anything that can appear in a Markdown document can appear inside a directive, including another directive.

### Nesting: the outer fence must be longer

This is the one rule that catches people, and it is the same rule code fences have always had. A closing fence closes the innermost open directive, so if the inner one uses three colons the outer one needs four.

:::::columns{ratio="1:1"}
```markdown
::::columns
Left column.

::col

:::card[Note]
Inside the right column.
:::
::::
```

::col

:::card[Note]{tone=info}
The outer fence is four colons because the card inside uses three. Get it wrong and the card's closing fence ends the columns block early instead.
:::
:::::

The rule counts every colon line inside, including the ones in a code block. The pair above is itself wrapped in a columns block, and because the source pane contains a four-colon line, that wrapper had to use five. A shorter line is safe: the other source panes on this page all contain `:::` inside a `::::` wrapper, which is why they can show directives without ending the block they sit in.

### Separator lines

One construct divides itself internally rather than by nesting. A line of exactly two colons followed by a name is a separator, and in v0 the only one is `::col` inside `columns`. It takes its own attribute specifier and does not need to be closed, so two columns cost one fence rather than three.

{.tick}
***

{.eyebrow}
Piece three

## What you get for free

A few class names are reserved by the specification, which means they work on the default stylesheet with no theme of your own. They exist so that the common typographic moves do not each need a construct.

:::figure[The reserved classes. A class used somewhere it does not belong is a warning, and the class is kept.]
| Class | Applies to | Meaning |
|---|---|---|
| `.lead` | paragraph | Opening paragraph, set larger |
| `.small` | span, paragraph | De-emphasized fine print |
| `.eyebrow` | paragraph | Short label above a heading |
| `.badge` | span | Inline pill |
| `.muted` | any | Reduced emphasis |
| `.info` `.success` `.warn` `.danger` `.neutral` | any | Tone, the same five a card's `tone` attribute uses |
:::

Everything else you write is yours. Unknown classes reach the HTML untouched and mean whatever a theme stylesheet says they mean, which is how the two long [examples](../examples/index.html) get their look without a single color in their source.

{.tick}
***

{.eyebrow}
Reference

## The eight constructs
