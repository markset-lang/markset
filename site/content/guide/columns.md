---
markset: 0
---

# Columns

Columns put regions side by side. The first column is implicit; each `::col` line starts the next. A `ratio` such as `2:1` sizes them, and its term count must match the column count. Put the primary column first, because the downgrade emits columns in source order.

Because `::col` is a two-colon line rather than a nested fence, two columns do not cost four levels of fencing. Note the four-colon outer fence when a card sits inside a column.
