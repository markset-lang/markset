# Changelog

## 0.0.0-rc.1 — 2026-09-14

First release candidate of the v0 specification and reference implementation.

- Grammar: attribute specifiers, bracketed spans, block directives, separator lines, attribute lines (spec §2).
- Constructs: callout, card, grid, columns, tabs, steps, metrics, figure, each with a defined HTML shape and CommonMark downgrade (§4).
- Frontmatter with the `markset` version key and theme tokens (§6).
- Diagnostics for every specified error and warning; a closed vocabulary with reported failures rather than silent passthrough.
- Conformance suite: 15 sections, 1478 graded aspects, including a mechanical check of the naive-output contract (§3, §7). Structure is normative; rendering strings are reference output.
- Reference implementation: parser on micromark and mdast, downgrade and HTML renderers, default stylesheet, `markset` CLI.
- Verified on GitHub: `examples/showcase.md` pasted into a comment keeps every block with its type in source order.
