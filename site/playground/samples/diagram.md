---
markset: 0
---

# How a request reaches a handler

{.lead}
A diagram is a fenced code block. There is no diagram construct, and there will not be one.

:::figure[A request that matches no route falls through to the 404 page.]
```ascii
  +---------+      +----------+      +---------+
  | Ingress |----->|  Router  |----->| Handler |
  +---------+      +----------+      +---------+
                        |
                        |  no match
                        v
                   +-----------+
                   |  404 page |
                   +-----------+
```
:::

The caption is not decoration. A drawn diagram with no text alternative would
remove content for a reader using a screen reader while adding it for everyone
else, so a fence outside a captioned figure is left as code.
