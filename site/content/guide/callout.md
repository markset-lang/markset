---
markset: 0
---

# Callout

Use a callout for advisory content that stands apart from the flow: a warning before a destructive step, a tip, a note about scope. Markset adopts GitHub's alert syntax unchanged, so a bare `> [!NOTE]` renders natively on GitHub too. A title after the marker and a `-` or `+` fold suffix are Obsidian's extension; on GitHub those forms fall back to an ordinary blockquote with the marker visible.

Five types exist: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`. Anything else is an error, because the vocabulary is closed.

## Attributes

A callout takes none of its own. The type, the optional title and the fold suffix are all part of the marker line. An attribute line before the blockquote attaches an id or classes to the callout itself.

| Part | Where | Values |
|---|---|---|
| Type | After `[!` on the first line | `NOTE` `TIP` `IMPORTANT` `WARNING` `CAUTION`, case-insensitive |
| Title | Rest of the marker line | Inline content; defaults to the type name, title-cased |
| Fold | Directly after the marker | `-` collapsed, `+` expanded, neither for a plain callout |

**Downgrade:** a blockquote whose first paragraph is the type name in bold followed by the title, then the body. The fold indicator is dropped.
