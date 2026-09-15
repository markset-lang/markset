---
markset: 0
---

# Metrics

Metrics render a table as tiles: label, value, and an optional delta whose leading `+` or `-` sets a direction. `direction=inverse` flips which sign reads as positive, for metrics like churn where down is good. The content must be exactly one table with at least two columns.

The header row names the columns for readers of the raw table; the tiles do not show it.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `direction` | `normal` `inverse` | `normal` |

Content must be exactly one table with at least two columns. Column roles are positional: label, value, and an optional delta. A delta beginning with `+` or `-` takes a direction from its sign, and `direction=inverse` flips which sign reads as good, for a measure like churn.

**Downgrade:** the table, unchanged.

**Watch for:** the header row is not rendered as a tile, but write it anyway. It is what makes the raw table readable to anyone who sees the source rather than the render.
