---
markset: 0
---

# Tabs

Tabs turn headings into tab labels. Every direct child heading at the first heading's level starts a tab; deeper headings are content. This is the cleanest degradation in the vocabulary, which is why tabs use headings rather than a separator: a stock renderer shows the headings and their content, in order.

Tab state uses radio inputs, so no JavaScript is involved. `active=<n>` picks the initially open tab.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `active` | A positive integer within the tab count | `1` |

Content must be headings and their blocks. The first heading found sets the tab level; every heading at that level starts a new tab and anything deeper is content inside it. Content before the first heading is an error, as is a heading shallower than the first.

**Downgrade:** the headings and their content, unchanged. This is the cleanest fallback in the vocabulary, and it is the reason tabs use headings rather than a separator.

**Watch for:** tab groups do not synchronize. Radio inputs cannot do it without a script, and scripts are out of scope.
