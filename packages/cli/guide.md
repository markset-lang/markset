# Writing Markset

You are writing a Markset document: Markdown with a small, closed set of layout constructs that a Markset renderer
turns into a styled page. A Markset file is still a Markdown file. Everything CommonMark and GitHub tables allow is
allowed, and a reader without Markset support still gets a complete, readable document.

The specification is at https://markset.org/spec/. This guide is the part of it you need to write well.

## How to work

1. Write the content first, as plain Markdown: headings, paragraphs, lists, tables.
2. Then give a construct to the content that already has its shape. Options side by side are a grid. A sequence is
   steps. Headline numbers are metrics. A warning a reader must not miss is a callout. Leave everything else as
   Markdown.
3. Check the file, and fix every error and warning it reports:

   ```sh
   npx @markset-lang/cli check document.md
   ```

4. If you can, render it and look at it: `npx @markset-lang/cli html document.md -o document.html`.

## Restraint

A construct earns its place by making the content easier to take in. Most of a good document is paragraphs.

- Do not wrap every section in a card. A card is a unit set apart from the flow: a summary, an aside, a definition.
- A grid needs at least two items, each short enough to read at a glance. Long items belong in a list or in sections.
- Metrics are for the few numbers a reader should see first. Detailed numbers belong in a table.
- One callout where a reader must not miss something. Three on a screen, and none of them stands out.
- Never use a construct for decoration. How the page looks is the theme's job, not the document's.

## The header

```markdown
---
markset: 0
---
```

`markset: 0` names the version of the specification the document is written against. It is a version, not a switch.
Keep it as the first lines of every Markset document.

A `theme` block sets design intent for the whole document. Add one only when you are asked to:

```markdown
---
markset: 0
theme:
  preset: report
  density: comfortable
---
```

The presets are `editorial`, `technical`, `deck` and `report`. `density` is `compact`, `comfortable` or `spacious`.
`radius` is `none`, `sm`, `md` or `lg`. Other keys in the frontmatter belong to the document and are left alone.

## The constructs

There are eight. Seven are fenced directives, `:::name`, and the callout is GitHub's alert syntax. Nothing else is a
construct: `:::note`, `:::warning` or `:::section` are errors, not extensions.

### callout

For something a reader must not miss: a warning, a caveat, a tip.

```markdown
> [!WARNING] Rollback takes four minutes
> Traffic is not drained first, so requests in flight fail.
```

The types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`. A title after the marker is optional. `[!NOTE]-`
starts the callout folded and `[!NOTE]+` open, for detail a reader may skip.

### card

For a self-contained unit set apart from the flow: a summary, an aside, a definition.

```markdown
:::card[What changes for customers]{tone=info}
Invoices move to the first of the month. Nothing else changes.
:::
```

The argument in brackets is the title, and it is optional. `tone` is `neutral`, `info`, `success`, `warn` or
`danger`. Any Markdown can go inside, including another construct.

### grid

For a few short, parallel items read side by side: options, features, people.

```markdown
:::grid{cols=3}
- **Staging**: deployed on every merge
- **Canary**: one percent of traffic
- **Production**: promoted by hand
:::
```

The content must be exactly one list, and each item becomes a tile. `cols` is 1 to 4, and 2 when it is not given.
An item can hold several paragraphs: indent them under the bullet as you would in any list.

### columns

For two or three regions side by side, such as an argument and its supporting evidence.

```markdown
::::columns{ratio="2:1"}
The main argument, at full length. Put the primary column first: without Markset, the columns are read in order.

::col

:::card[In short]
Three numbers and a date.
:::
::::
```

`::col` starts the next column. `ratio` has one term per column. The outer fence has four colons because it holds a
directive with three: an outer fence is always longer than the fences inside it.

### tabs

For alternatives a reader needs only one of: platforms, languages, roles.

```markdown
:::tabs
### macOS
Install it with Homebrew.

### Windows
Install it with winget.
:::
```

Each heading becomes a tab label, and its content is the tab. All the tab headings are at one level, and nothing comes
before the first. Without Markset the headings and their content read as ordinary sections, so write them to stand on
their own.

### steps

For a procedure or a sequence a reader follows in order.

```markdown
:::steps
1. Export the data from the old system.
2. Run the import, and keep its report.
3. Compare the totals before switching over.
:::
```

The content must be exactly one ordered list. A step can hold more than one paragraph, indented under its number.

### metrics

For the few numbers a reader should see first.

```markdown
:::metrics
| Metric  | Value | Change |
|---------|-------|--------|
| Revenue | $4.2M | +12%   |
| Churn   | 2.1%  | -0.4%  |
:::
```

The content must be exactly one table of at least two columns: label, value, and an optional change. The header row
is not shown. A change starting with `+` or `-` is shown as up or down. Write `:::metrics{direction=inverse}` when down
is good, as it is for churn or latency. The direction applies to the whole block, so when some headline numbers are
better up and others better down, write two metrics blocks.

### figure

For an image, a table or a diagram with a caption.

```markdown
:::figure[Requests per second, by quarter]{chart=line}
| Quarter | us-east | eu-west |
|---------|---------|---------|
| Q1      | 120     | 64      |
| Q2      | 140     | 71      |
:::
```

The argument is the caption. The content must be exactly one image, one table or one code block. `width` takes a
percentage, such as `width=60%`, and nothing else.

`chart` draws a table as a chart: `line`, `bar` (horizontal bars) or `column` (vertical bars). The first column is the
category axis and every other column is a series. A cell may carry a unit or thousands separators, such as `26%`,
`$4.10` or `1,200`; a cell with no number in it is a gap, never a zero. The table is still shown beside the chart, and
it is the chart's fallback, so keep a charted table to the rows the argument needs. A chart needs a caption.

A diagram is a code block in a captioned figure. Draw it in ASCII: a renderer draws ASCII as a picture, and anywhere
else it is still a diagram.

````markdown
:::figure[A request, from ingress to handler]
```ascii
+---------+      +--------+      +---------+
| Ingress |----->| Router |----->| Handler |
+---------+      +--------+      +---------+
```
:::
````

## Attributes and classes

A bracketed span marks an inline run:

```markdown
The new exporter is [Beta]{.badge .warn} and off by default.
```

A line holding only an attribute specifier applies it to the block that starts on the next line, with no blank line
between them:

```markdown
{.eyebrow}
Quarterly review

## Capacity is the constraint

{.lead}
We can serve the forecast through the second quarter, and not beyond it without the new region.
```

Classes combine. A byline is a small, muted paragraph:

```markdown
{.small .muted}
Prepared by the platform team, 3 October.
```

These classes are part of the language. Any other class is allowed, but it means something only to a theme that
defines it.

| Class | On | Means |
|---|---|---|
| `.lead` | a paragraph | an opening paragraph, larger |
| `.eyebrow` | a paragraph | a short label above a heading |
| `.small` | a span or a paragraph | fine print |
| `.badge` | a span | an inline pill |
| `.muted` | anything | less emphasis |
| `.info` `.success` `.warn` `.danger` `.neutral` | anything | a tone |

A directive takes its attributes in its own braces, `:::card{.muted}`, never on a line before it.

## Rules that keep a document portable

- No raw HTML. It is not rendered.
- No colors, sizes, fonts or inline styles. The only measurements a document holds are a `columns` ratio and a
  `figure` width.
- After an attribute line, write a horizontal rule as `***`, not `---`.
- Write so the fallback reads well. Without Markset, a card's title becomes a heading one level below the section it
  is in, a grid is a list, columns are read in order, and tabs are sections.
- A paragraph straight after an opening fence is fine. An ordered list that does not start at 1, an indented code block
  or a heading underlined with `===` is not: without Markset it would merge into the fence line. Put a blank line
  after the fence first.

## What the checker reports

`check` names each problem with a code. The ones you are most likely to meet:

| Code | Means | Fix |
|---|---|---|
| `DIRECTIVE_UNKNOWN_NAME` | a `:::name` outside the eight | use a construct from this guide, or plain Markdown |
| `DIRECTIVE_UNCLOSED` | a directive with no closing fence | close it, with as many colons as it opened with |
| `GRID_CONTENT` | a grid that is not exactly one list | make the content one list |
| `STEPS_CONTENT` | steps that are not exactly one ordered list | number the list |
| `METRICS_CONTENT` | metrics that are not one table of two or more columns | make the content one table |
| `FIGURE_CONTENT` | a figure that is not one image, table or code block | keep one, and move the rest out |
| `CHART_CONTENT` | `chart` on a figure that holds no table | give it a table, or drop `chart` |
| `TABS_NO_HEADINGS` | tabs with no headings in them | start each tab with a heading |
| `TABS_CONTENT_BEFORE_HEADING` | content before the first tab heading | move it into a tab, or out of the tabs |
| `COLUMNS_RATIO_MISMATCH` | a ratio whose terms do not match the columns | one term per column |
| `ATTR_LINE_ORPHAN` | an attribute line followed by a blank line | remove the blank line |
| `ATTR_LINE_ON_DIRECTIVE` | an attribute line before a directive | put the attributes in the directive's braces |
| `CLASS_MISAPPLIED` | a language class where it does not apply | see the table of classes |
| `DEGRADATION_BLANK_LINE` | a block that would merge into the fence line without Markset | add a blank line after the opening fence |
| `DIRECTIVE_INVALID_ATTRIBUTE` | an attribute value outside its allowed set | use a value this guide lists |
