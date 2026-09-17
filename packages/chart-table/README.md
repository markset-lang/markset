# @markset-lang/chart-table

Draws a data table as a line, bar or column chart. A pure function with no dependencies that returns an SVG as a [hast](https://github.com/syntax-tree/hast) tree, with no color in it.

```sh
npm i @markset-lang/chart-table
```

```js
import { chart } from "@markset-lang/chart-table";

const svg = chart("line", {
  categoryLabel: "Quarter",
  categories: ["Q1", "Q2", "Q3", "Q4"],
  series: [
    { name: "Baseline", values: [120, 128, 141, 150] },
    { name: "Forecast", values: [120, 131, 149, 172] },
  ],
});
```

Returns a hast `element` node for an `<svg>`, or `null` when there is nothing to draw. The tree drops straight into any hast pipeline, or into `hast-util-to-html` for a string.

## The data

The shape mirrors a table, which is what spec §11 says a chart is drawn from: the first column is the category axis in document order, every other column is a series named by its header, and a non-numeric cell is a gap (`null`), never a zero.

| Type | Categories run | Use for |
|---|---|---|
| `line` | across | Ordered periods, where the shape between points is the argument |
| `column` | across | A few categories compared by height |
| `bar` | down | Long names or ranked lists, read top to bottom |

Bars start at zero, because a bar encodes magnitude as length and a truncated baseline misstates the ratio. Lines fit their data, because a line encodes magnitude as position and forcing zero flattens the shape the chart exists to show. A `bar` chart's left margin is measured off its longest label so nothing is clipped, and colliding labels along a horizontal axis are thinned rather than overlapped.

## No color, on purpose

The output carries geometry and series identity — each mark has `data-series="1"` through `"8"` — and not one `fill` or `stroke`. The stylesheet colors it. In [`@markset-lang/render-html`](https://www.npmjs.com/package/@markset-lang/render-html) that is `markset.css`, whose eight chart hues were checked for lightness, chroma, colorblind separation and contrast against its own surfaces in both light and dark; a theme recolors every chart by setting `--ms-chart-1` through `--ms-chart-8`. If you use this package on its own, you supply those rules.

## Why a tree and not a string

The ASCII diagram engine returns an SVG string that the renderer wraps in an `<img>`, because a diagram engine may be an arbitrary command and raw markup from one is a channel documents are denied. This engine is not that: it constructs nodes, so there is no markup to parse and no channel to open, and inline SVG is what lets a stylesheet color the chart at all. In Markset the chart is placed in front of its table and never replaces it (§11, obligation 8): the picture is a lossy view of data the reader may want exactly.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
