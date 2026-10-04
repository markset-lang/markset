---
markset: 0
theme:
  preset: technical
---

{.eyebrow}
Tools

# The remark plugin

{.lead}
`@markset-lang/remark-markset` teaches a unified pipeline you already run to read Markset. If you use remark in Astro,
Next, Eleventy, a lint step or a script, this is how you get the constructs without replacing any of it.

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

Constructs become typed mdast nodes, `grid`, `card`, `callout`, `figure`, `tabs`, `steps`, `metrics` and `columns`,
beside `span` nodes for bracketed spans. Attributes are lowered onto `data.hProperties`, so any mdast-to-hast
conversion picks them up with no further work.

## Rendering to HTML

The renderer's handlers come from `@markset-lang/render-html`:

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

That pipeline produces the same HTML as the library's own renderer, and a test asserts it byte for byte. The
stylesheet is `@markset-lang/render-html/css/markset.css`, or `markset css` from the command line.

## Diagnostics

The vocabulary is closed, so an unknown directive name is an error rather than markup that quietly passes through.
Problems arrive as ordinary vfile messages: `ruleId` is the Markset code, such as `DIRECTIVE_UNKNOWN_NAME`, `source`
is `"markset"`, and `fatal` is true for an error. A pipeline that already reports vfile messages reports these without
being taught anything.

## What it leaves to you

The plugin adds Markset and nothing else, because your pipeline already has opinions. Tables are GitHub's: add
`remark-gfm`. Frontmatter is `remark-frontmatter`: add it, and the plugin reads the `yaml` node into the document's
theme. A document with no constructs in it parses and renders exactly as it did before the plugin was added.
