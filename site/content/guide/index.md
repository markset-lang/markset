---
markset: 0
---

# Guide

One page per construct. Each page explains when to reach for the construct, shows the canonical example rendered live by the reference implementation next to its source and its plain-CommonMark downgrade, and lists a few of the errors the validator reports. The examples are read from the conformance suite at build time, so the guide cannot disagree with the tests.

Before the constructs, the three pieces of grammar they share:

- **Attribute specifier** `{#id .class key=value}` sets an id, classes, and typed attributes. Quoted values may contain spaces.
- **Block directive** `:::name[argument]{attributes}` opens a container closed by a line of at least as many colons. Nest with longer outer fences, as with code fences.
- **Bracketed span** `[text]{.class}` applies attributes inline. An **attribute line** `{.lead}` on its own line applies them to the block that follows.
