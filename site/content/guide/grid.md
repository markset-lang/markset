---
markset: 0
---

# Grid

A grid turns a list into a row of cards. It is the construct for feature lists, pricing tiers, and anything that reads as "a set of parallel items". The content must be exactly one list, which is what guarantees the degradation: on a renderer that has never heard of Markset, the grid is the list.

`cols` runs from 1 to 4 and renderers reduce it at narrow widths. Items may contain nested blocks.
