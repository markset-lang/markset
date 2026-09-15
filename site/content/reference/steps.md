---
markset: 0
---

# Steps

Steps present a numbered procedure. The content must be exactly one ordered list; items may hold nested blocks such as code or callouts. The list's start number is honored, so a procedure can continue from an earlier one.

If a list does not start at 1, leave a blank line after the opening fence: a stock CommonMark parser cannot start such a list directly after a paragraph line, and the validator warns when it would be swallowed.

## Attributes

Steps take no attributes of their own beyond an id and classes. The numbering comes from the list.

Content must be exactly one ordered list. Items may hold any blocks, so a step can carry a code block, a table or a callout.

**Downgrade:** the list, unchanged.

**Watch for:** a list that does not start at 1 needs a blank line after the opening fence. Without one, a stock CommonMark parser cannot start a list with a different number directly after a paragraph line, and the numbering is lost in the fallback. The validator warns when that would happen.
