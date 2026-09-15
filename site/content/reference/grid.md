---
markset: 0
---

# Grid

A grid turns a list into a row of cards. It is the construct for feature lists, pricing tiers, and anything that reads as "a set of parallel items". The content must be exactly one list, which is what guarantees the degradation: on a renderer that has never heard of Markset, the grid is the list.

`cols` runs from 1 to 4 and renderers reduce it at narrow widths. Items may contain nested blocks.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `cols` | `1` to `4` | `2` |
| `gap` | `sm` `md` `lg` | `md` |

Content must be exactly one list, ordered or unordered; anything else is an error. That single rule is what guarantees the fallback, and it is why a grid cannot hold loose paragraphs or two lists.

**Downgrade:** the list, unchanged.

**Watch for:** `cols` is a maximum, not a promise. A renderer reduces it on a narrow screen and the breakpoints are its business, not the document's.
