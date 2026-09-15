---
markset: 0
---

# Columns

Columns put regions side by side. The first column is implicit; each `::col` line starts the next. A `ratio` such as `2:1` sizes them, and its term count must match the column count. Put the primary column first, because the downgrade emits columns in source order.

Because `::col` is a two-colon line rather than a nested fence, two columns do not cost four levels of fencing. Note the four-colon outer fence when a card sits inside a column.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `ratio` | Colon-separated integers, one per column | equal |
| `gap` | `sm` `md` `lg` | `md` |

A `::col` separator takes `#id` and classes of its own; any other key on it warns. If `ratio` is present its term count must equal the number of columns, or it is an error and the ratio is dropped. A `columns` with no separator at all is a warning, since a single column is almost always a mistake.

**Downgrade:** the columns in source order, one after another, with the separators removed. Put the column that must be read first in the first position.

**Watch for:** `ratio` is the only per-instance geometry in the whole vocabulary, and it exists because relative column width is genuinely content, not styling. It is not a licence to size anything else.
