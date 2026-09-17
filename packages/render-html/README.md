# @markset-lang/render-html

Renders a [Markset](https://markset.org/) tree to HTML, and ships the default stylesheet that styles it.

```sh
npm i @markset-lang/render-html
```

```js
import { parseDocument } from "@markset-lang/parser";
import { renderHtml, renderPage, defaultStylesheetPath } from "@markset-lang/render-html";
import { readFile } from "node:fs/promises";

const { ast } = parseDocument(source);

const fragment = renderHtml(ast);
const page = renderPage(ast, {
  stylesheet: { inline: await readFile(defaultStylesheetPath, "utf8") },
  theme: { href: "/brand.css" },
});
```

Or, when you have a string and want a string: `html(source)` parses and renders in one step and returns the diagnostics alongside.

## The output

Every construct is an element with an `ms-` class — `ms-card`, `ms-grid-item`, `ms-callout-title` — and semantic variants are `data-` attributes: `data-tone="info"`, `data-cols="3"`, `data-direction="up"`. Author classes follow the `ms-` class in source order, and `{#id}` becomes `id`. Spec §4 defines the shape per construct.

Nothing in the output runs. Tabs are radio inputs, a folding callout is a `<details>`, and raw HTML in the source is never passed through. The renderer also emits the accessibility information it can derive without the author writing any: header cells take `scope="col"`, a callout is `role="note"` named by its title, a figure's caption on a table is the table's own `<caption>`, and every heading without an id gets one so sections can be linked.

## Options

| Option | Default | What |
|---|---|---|
| `headingIds` | `true` | Give headings without an explicit id a generated one (§2.1). |
| `diagrams` | `ascii` built in | Draw diagram fences inside captioned figures (§10). An object adds languages; `false` draws none. |
| `charts` | built in | Draw a figure's table as a chart when it says `chart=line`, `bar` or `column` (§11). `false` draws none. |

`renderPage` adds `title`, `lang`, `stylesheet` and `theme`, each stylesheet given as `{ inline }` text or an `{ href }` to link. The theme is emitted after the default so it can restyle constructs and override tokens. Frontmatter theme tokens (§6) become `data-preset`, `data-density`, `data-radius` and custom properties on `<body>`.

## The stylesheet

`css/markset.css` is exported at `@markset-lang/render-html/css/markset.css`, and `defaultStylesheetPath` is its path on disk. One palette, every color a `light-dark()` pair resolved through `color-scheme`; `data-scheme="light"` or `"dark"` on `<body>` forces one, and with no attribute the reader's system preference applies. Print forces light. Tables wider than a phone scroll inside themselves rather than pushing the page sideways.

A theme stylesheet layers over it. It reaches the constructs by their `ms-` classes and the tokens by their custom properties — `--ms-accent`, `--ms-measure`, `--ms-chart-1` — and it decides what the document's author classes look like.

## Drawing

Diagrams and charts are engines the renderer calls, not things it does itself. The `ascii` engine is [`@markset-lang/diagram-ascii`](https://www.npmjs.com/package/@markset-lang/diagram-ascii) and the chart engine is [`@markset-lang/chart-table`](https://www.npmjs.com/package/@markset-lang/chart-table); both are pure functions with no dependencies. A `DiagramEngine` is any function from fence text to SVG string, so a language you need is one entry in the `diagrams` option. A fence is only ever drawn inside a captioned `figure`, because the caption is the text alternative, and an engine that fails leaves the code block in place. A chart goes in front of its table and never replaces it.

## Inside unified

`marksetHandlers()` returns the mdast-to-hast handlers, for a pipeline that uses `remark-rehype` rather than `renderHtml`. Together with [`@markset-lang/remark-markset`](https://www.npmjs.com/package/@markset-lang/remark-markset) it produces the same HTML as this package's own path, byte for byte, and a test holds the two together.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
