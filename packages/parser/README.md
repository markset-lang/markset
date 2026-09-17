# @markset-lang/parser

The reference parser for [Markset](https://markset.org/): CommonMark plus a closed vocabulary of layout constructs, parsed to an mdast tree.

```sh
npm i @markset-lang/parser
```

```js
import { parseDocument } from "@markset-lang/parser";

const { ast, frontmatter, diagnostics } = parseDocument(source);
```

Markset is a strict superset of CommonMark, so every Markdown document parses to exactly the tree `mdast-util-from-markdown` would produce, plus GFM tables. Markset adds three grammar pieces — the attribute specifier `{#id .class key=val}`, the bracketed span `[text]{.class}`, and the fenced directive `:::name` — and eight constructs built from them.

## What comes back

`ast` is an mdast `Root`. Its extra node types are:

- **Construct nodes**, one per spec §4 construct: `callout`, `card`, `grid`, `columns` (with `column` children), `tabs` (with `tab` children), `steps`, `metrics`, `figure`. Each carries its attributes as typed fields — `cols: 3`, `tone: "info"`, `ratio: [2, 1]` — plus `id`, `classes`, and its content as ordinary mdast children.
- **`span`**, a bracketed span with `attributes`.
- **`directive`**, a generic directive kept as-is when its content failed validation, so nothing is lost.
- **`attributes`** on any block an attribute line (§2.5) preceded, and on a list item that opened with one.

`frontmatter` is the parsed §6 theme block, or `null`. `diagnostics` is every validation result, sorted by position:

```ts
interface Diagnostic {
  code: string;        // "GRID_CONTENT", "DIRECTIVE_UNKNOWN_NAME", ...
  severity: "error" | "warning";
  message: string;
  start: number;       // character offsets into the source, end-exclusive
  end: number;
}
```

Diagnostics are returned, never thrown. An invalid document still parses, with the failing directive left generic, and `hasErrors(diagnostics)` says whether it is valid.

## Why the vocabulary is closed

An unknown directive name is an error rather than silent passthrough. That is what lets a second implementation agree with this one, and what lets `markset check` mean something. The eight names are exported as `BLOCK_DIRECTIVE_NAMES`; the deferred list and its reasoning is spec §8.

## Using it inside unified

If you already run remark, use [`@markset-lang/remark-markset`](https://www.npmjs.com/package/@markset-lang/remark-markset), which assembles the same extensions as a plugin. The pieces are exported here too — `markset()` is the micromark syntax extension and `marksetFromMarkdown()` the mdast compiler extension — along with the passes `parseDocument` runs after them: `attachAttributeLines`, `validateStructure`, `normalizeConstructs`, `readFrontmatter`.

## Conformance

Every case in [`@markset-lang/conformance-suite`](https://www.npmjs.com/package/@markset-lang/conformance-suite) is pinned against this parser's output. If you are writing a parser of your own, that package is what you check against, not this one.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
