# @markset-lang/render-downgrade

Renders a [Markset](https://markset.org/) tree as plain CommonMark: what a document becomes when it is published somewhere that has never heard of Markset.

```sh
npm i @markset-lang/render-downgrade
```

```js
import { downgrade } from "@markset-lang/render-downgrade";

const { markdown, diagnostics } = downgrade(source);
```

`renderDowngrade(tree)` does the same from a tree you already parsed, and `downgradeTree(tree)` returns the transformed mdast without serializing it, for a pipeline that wants to keep going.

## What each construct becomes

Every construct has a normative downgrade in spec §4, and the conformance suite pins each one:

| Construct | Downgrade |
|---|---|
| `callout` | A blockquote opening with `**Note:**` and the title |
| `card` | Its title as a heading one level below the current section, then its body |
| `grid`, `steps` | The list, unchanged |
| `columns` | The columns in source order, one after another |
| `tabs` | The headings and their content, unchanged |
| `metrics` | The table, unchanged |
| `figure` | The content, then the caption as an italic paragraph |
| span | Its text, attributes dropped |

Attribute lines and specifiers are dropped. Frontmatter is kept. A directive that failed validation contributes its content without the fence, so nothing an author wrote is lost.

## Why it exists

Markset's third invariant is that every construct degrades: to a defined CommonMark output, and to a readable naive rendering when raw source is pasted into a stock parser. This renderer is the first half of that contract, and it is deliberately simple — the reference implementation built it before the HTML renderer, because a construct that does not downgrade cleanly should not exist.

Serialization is fixed so the suite can pin output byte for byte: `-` bullets, `*` for emphasis and strong, fenced code, GFM tables padded to column width, and column alignment preserved.

Specification: <https://markset.org/spec/>. Source: <https://github.com/markset-lang/markset>.

MIT.
