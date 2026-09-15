---
markset: 0
---

# Card

A card is a titled surface around any content. Use it to group related blocks, to give a sidebar a boundary, or to make a call to action stand out. The bracketed argument is the title; `tone` picks one of five semantic tones and `compact` tightens the padding. Cards nest, with a longer outer fence.

In the downgrade the title becomes a heading one level below the current section, so the document outline stays intact.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `tone` | `neutral` `info` `success` `warn` `danger` | `neutral` |
| `compact` | `true` `false` | `false` |

The argument is the title and may contain inline markup. Content is anything at all, including nothing.

**Downgrade:** the title becomes a heading one level below the current section, capped at six, and the body follows as ordinary blocks. The current level is that of the most recent heading in the output, so a card inside a section does not flatten the outline.

**Watch for:** a setext heading or an indented code block directly after the opening fence. Both read differently once the fence is gone, and the validator warns. A blank line after the fence avoids it.
