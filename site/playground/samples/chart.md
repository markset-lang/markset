---
markset: 0
---

# Queue depth

{.lead}
A chart is a figure holding a table. The table stays: the picture is a lossy view
of data somebody may want exactly.

:::figure[Messages waiting, by hour.]{chart=line}
| Hour | Primary | Overflow |
|---|---|---|
| 09 | 120 | 10 |
| 10 | 340 | 22 |
| 11 | 810 | 95 |
| 12 | 640 | 61 |
| 13 | 220 | 18 |
:::

Delete `chart=line` and you still have the numbers. That is the whole argument
for sourcing a chart from a table rather than from a data fence.
