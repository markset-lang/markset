# @markset-lang/remark-markset

A [remark](https://github.com/remarkjs/remark) plugin that teaches an existing [unified](https://unifiedjs.com) pipeline to read [Markset](https://markset-lang.github.io/markset/).

If you already run remark — in Astro, Next, Eleventy, Gatsby, a lint step, a script — this is how you get Markset's constructs without replacing any of it.

```sh
npm i @markset-lang/remark-markset
```

## Parsing

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMarkset from "@markset-lang/remark-markset";

const tree = await unified().use(remarkParse).use(remarkMarkset).parse(source);
```

Constructs become typed mdast nodes — `grid`, `card`, `callout`, `figure`, `tabs`, `steps`, `metrics`, `columns` — alongside `span` nodes for bracketed spans. Attribute specifiers and attribute lines are lowered onto `data.hProperties`, so any mdast-to-hast conversion picks them up with no further work.

## Rendering to HTML

The renderer's handlers are a separate package, so you only install them if you want them:

```js
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { marksetHandlers } from "@markset-lang/render-html";

const file = await unified()
  .use(remarkParse)
  .use(remarkMarkset)
  .use(remarkRehype, { handlers: marksetHandlers() })
  .use(rehypeStringify)
  .process(source);
```

That pipeline produces the same HTML as the library's own `renderHtml`, and a test in this repository asserts it byte for byte.

You will also want the stylesheet, which is `@markset-lang/render-html/css/markset.css`, or `markset css` from the CLI.

## Diagnostics

Markset has a closed vocabulary, so an unknown directive name is an error rather than silent passthrough (spec §3). Those arrive as ordinary vfile messages:

```js
for (const m of file.messages) {
  console.log(m.fatal ? "error" : "warning", m.ruleId, m.reason, m.line, m.column);
}
```

`ruleId` is the Markset diagnostic code (`DIRECTIVE_UNKNOWN_NAME`, `GRID_BAD_COLS`, …) and `source` is `"markset"`, so a pipeline that already reports vfile messages will report these without being taught anything.

`fatal` is `true` for errors and `false` for warnings. A document with any error is invalid; warnings are not.

## What it deliberately does not turn on

This plugin adds Markset and nothing else, because your pipeline already has opinions:

- **Tables** are GFM. Add `remark-gfm`.
- **Frontmatter** is `remark-frontmatter`. Add it, and this plugin will read the `yaml` node it produces into the document's theme (spec §6). Without it, frontmatter is not parsed and nothing breaks.

The reference `parseDocument` enables both because it is rendering whole documents; a plugin that did the same would be changing your pipeline behind your back.

## Every CommonMark document is unaffected

Markset is a strict superset: a document with no constructs in it parses and renders exactly as it did before you added the plugin. There is a test for precisely that, comparing the output with and without.

## Peer dependencies

`unified` and `remark-parse`, both version 11 or later — you already have them.

MIT.
