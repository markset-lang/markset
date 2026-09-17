# @markset-lang/diagram-ascii

Draws an ASCII diagram as SVG. A pure function with no dependencies: text in, SVG out.

```sh
npm i @markset-lang/diagram-ascii
```

```js
import { drawAscii } from "@markset-lang/diagram-ascii";

const svg = drawAscii(`
+--------+      +--------+
| ingest | ---> | index  |
+--------+      +--------+
`);
```

Returns the SVG markup as a string, or `null` when there is nothing to draw.

## What it draws

A deliberately small subset, written down so it can be relied on:

```
-  horizontal line        +  corner or junction
|  vertical line          /  \  diagonal
>  <  ^  v  arrowheads, recognized only where a line actually arrives
```

Everything else is text, set in a monospace face at the cell it occupies. There is no box detection, no layout, and no attempt to be svgbob: the diagram is drawn exactly where the author put it, cell by cell, so what renders is what is in the file. A lone `-` between two letters is part of a word, not a rule, so `us-east` stays a word.

The SVG carries its own `prefers-color-scheme` block and follows the embedding page's `color-scheme`, so a diagram in a forced light or dark page matches it.

## Why ASCII

This is the default diagram engine of [`@markset-lang/render-html`](https://www.npmjs.com/package/@markset-lang/render-html), and the only one the reference implementation ships. Spec §10 says why: every other diagram source falls back to its own source code when it cannot be drawn, which is honest but is not a diagram. ASCII falls back to a diagram, because it already was one — in a terminal, a diff, a GitHub comment, or the downgraded document. It is the one common diagram source whose undrawn form is as good as its drawn form.

In Markset a fence is drawn only inside a captioned `figure`, because the caption is the text alternative a drawn picture needs. That rule is the renderer's, not this package's; this function draws whatever it is given.

## Using it elsewhere

Nothing here knows about Markset. It is a string-to-string function that a static site generator, a documentation tool, or a test can call directly.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
