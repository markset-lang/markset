---
markset: 0
---

# Charts

{.lead}
A chart is a `figure` whose content is a table and whose specifier names a chart type. There is no `chart` construct, and there is not going to be one: the table is the source, the picture is drawn from it, and the table stays on the page.

:::figure[Stored petabytes by quarter, under three planning scenarios.]{#fig-tour chart=line}
| Quarter | Steady | Enterprise-led | Self-serve |
|---|---|---|---|
| FY27 Q1 | 12.4 | 12.6 | 12.8 |
| FY27 Q2 | 13.5 | 14.0 | 13.9 |
| FY27 Q3 | 14.7 | 15.5 | 14.9 |
| FY27 Q4 | 16.0 | 17.2 | 15.8 |
| FY28 Q1 | 17.4 | 19.1 | 16.6 |
| FY28 Q2 | 18.9 | 21.2 | 17.3 |
:::

That is the whole syntax. Everything except `chart=line` already worked: `figure` has always taken a table, and a GFM table is a table.

## Why the source is a table

Section 3 asks a document to read where the layout cannot follow, and this is the place that requirement pays best. A diagram's content has no canonical text form, so [diagrams](../diagrams/index.html) settle for a fence that degrades to its own source — honest, and not a diagram. A chart's content does have one: it is the data, and a reader of a quantitative document wants it anyway.

So the naive output of a chart is the numbers themselves, in every target, with no engine installed. A fence naming a data language would either duplicate the table the document was going to contain regardless, or replace it with JSON that nobody reads.

## The types

| Type | Draws | Category axis |
|---|---|---|
| `line` | each series as a line | horizontal |
| `column` | each value as a vertical bar | horizontal |
| `bar` | each value as a horizontal bar | vertical |

`bar` and `column` are the same encoding on opposite axes, and they are two type names rather than one type plus an orientation. An orientation would be presentational, which invariant 1 keeps out of documents. Which axis carries the categories is not: it follows from the data — long names and ranked lists read down, ordered periods read across — and a theme could not make the choice even if it were handed it.

The set is **closed**, which is the opposite of the diagram language set, and the asymmetry is deliberate. An unknown diagram language is safe, because it falls back to a code block showing exactly what the author wrote. An unknown chart type is not: the author has asked for a particular reading of their data, and a renderer that guessed would draw a different argument from the same numbers. So `chart=pie` is an error and the figure stays a plain table.

## How a table becomes series

Renderers that draw have to agree on this, or one document is two different pictures.

- The **first column** is the category axis, in document order. Its header names that axis.
- **Every other column** is one series, named by its header cell.
- A cell that is **not a number** is a missing point, not a zero. A series may have gaps, and a line breaks rather than diving to the baseline and back.

Thousands separators and a unit on either side are read through, so `1,200` and `$4.10` and `26%` all reach the chart. A column that holds no numbers at all is simply not a series.

Everything beyond that — scales, gridlines, tick density, where a legend sits, which color a series takes — is the theme's. A document names what its data means and never how the picture looks.

## Write the table for the chart, or don't chart it

This is the part that catches people, and it is a real cost rather than a rough edge.

A table written to be *read* and a table written to be *drawn* are not always the same table. A reference table that puts petabytes beside tenant counts beside a percentage is a good table and an impossible chart: the only single picture of it would need a second axis at a different scale, which is the one thing a chart must never be.

The failure mode is the safe one. Mark such a table `chart=` and you get a table, because a column of prose has no numbers to plot. But the better move is to notice and split it — one figure per measure — or to leave it as a table, which is frequently the right answer.

## What a renderer may do

Eight obligations, in [spec §11](../../spec/index.html#11-charts). The two worth knowing as an author:

**The table never goes away.** A drawn chart is added in front of its table, never substituted for it. A diagram's fallback is lossy by nature, so replacing it costs a reader nothing they could otherwise have had. A chart's picture is a lossy view of data that is sitting right there, and in a document where the numbers are the argument, the reader who wants an exact value is not an edge case.

**No caption, no picture.** The caption is what says what the chart shows, so a figure without one is rendered as an ordinary table however capable the renderer is. Same rule as diagrams, and the same reason: the output claims only what it can keep true.

Drawing never changes the AST, and a chart that fails to draw leaves the table untouched. Both mean that turning drawing off — `markset html --chart none` — costs a picture and no data.

## Colors are the theme's

The drawn chart contains no color at all. It carries geometry and a series number, and the stylesheet supplies the rest, so a theme restyles charts the way it restyles anything else:

```css
body {
  --ms-chart-1: #0f766e;
  --ms-chart-2: #b4501f;
}
```

The eight default slots are a validated categorical palette rather than eight colors picked by eye: checked for separation under colorblind simulation and for contrast against the stylesheet's own surfaces, in light and dark. Series take slots in order, and a ninth series folds back to the first — reusing a color is honest about running out, where generating one would produce a hue nothing had checked.

**Watch for:** a chart is not announced to assistive technology, because the table beside it carries every value and the caption names the figure; announcing both would say the same thing twice. There is also no way to annotate a single mark — to point at one bar and say *this is the one* — so put that in the caption or the prose.
