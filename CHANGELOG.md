# Changelog

## Unreleased

## 0.0.0-rc.2 — 2026-09-14

Second release candidate. Everything here came out of writing real documents against rc.1, which is what the candidate period is for. Three of the four documents that now exist were written after rc.1 was tagged, and the last two forced no change to §2 or §4.

**One change can alter how an existing document parses**, which is why this is a new candidate rather than a quiet update. Spec §0 permits that during the candidate period with a tag and an entry; this is the entry.

### Specification

- **§2.5 — attribute lines open a list item.** A `{.class}` line as the first thing in a list item now attaches to the item rather than to the block inside it, so one grid item or one step can carry an id, classes, or data attributes. *This is the change that can alter an existing parse.*
- **§4.8 — a figure around a table emits a real `<caption>`.** When a figure's content is a table, the caption becomes the table's own `<caption>` element instead of a sibling `<figcaption>`, because that is what a screen reader announces as the table's name. The AST does not move.
- **§6 — theme stylesheets are the renderer's choice, not the document's.** `markset html --theme <file>` appends one after the default stylesheet, and `renderPage` takes a `theme` option. No frontmatter token names a stylesheet, deliberately: a document that pointed at one would render differently depending on whether the file traveled with it.
- **§6 — a color scheme may be forced by the chrome, never by the document.** `data-scheme="light"` or `"dark"` on `<body>`. Which colors a reader sees is not authorial intent.
- **§2.1 — generated heading ids.** A renderer producing HTML should give every heading without an explicit id a generated one. Explicit ids always win and are reserved before any are generated.
- **§8 — the test a proposed construct has to pass** is now stated rather than implied: a need justifies a construct only when it cannot be met by a class, because it requires independent renderers to agree on structure rather than appearance.

### Reference implementation

- `addHeadingIds` in `@markset/render-html`, applied by `renderHtml` unless `headingIds: false`. It sets the id on the heading node, so a caller that also builds a table of contents reads the same ids it renders.
- The default stylesheet holds one palette. Each color is a `light-dark(light, dark)` pair resolved through `color-scheme`, replacing the duplicated `prefers-color-scheme` block. Printing forces light, which fixes a reader who chose dark printing a dark surface with pale borders.
- Default stylesheet layout: two lanes with one left edge. Prose stops at the reading measure; grid, columns, metrics, tabs, figure and tables run to the wide measure.
- Small-screen fixes: a grid item, column, tab panel and card no longer push the page sideways, and a table scrolls within its own box rather than widening the document.

### Documents

- Three more worked examples, each with a theme stylesheet of its own: an analysis document, a strategy memo, and an incident review. Every system, company and figure in them is invented.
- `docs/future-requirements.md`, a register of what real documents asked for and v0 does not do. It is the open counterpart to spec §8. Three entries have been closed by building the thing; one was closed by counting and deciding against it.

### Tooling and site

- Documentation site with a page per construct, a frontmatter and theme token reference, a conformance browser generated from `tests/*.json`, and the four examples. Deployed to GitHub Pages.
- `markset html --theme`, plus a dev server with live reload for the site.
- Biome for lint and formatting, gated in CI.

## 0.0.0-rc.1 — 2026-09-14

First release candidate of the v0 specification and reference implementation.

- Grammar: attribute specifiers, bracketed spans, block directives, separator lines, attribute lines (spec §2).
- Constructs: callout, card, grid, columns, tabs, steps, metrics, figure, each with a defined HTML shape and CommonMark downgrade (§4).
- Frontmatter with the `markset` version key and theme tokens (§6).
- Diagnostics for every specified error and warning; a closed vocabulary with reported failures rather than silent passthrough.
- Conformance suite: 15 sections, 1478 graded aspects, including a mechanical check of the naive-output contract (§3, §7). Structure is normative; rendering strings are reference output.
- Reference implementation: parser on micromark and mdast, downgrade and HTML renderers, default stylesheet, `markset` CLI.
- Verified on GitHub: `examples/showcase.md` pasted into a comment keeps every block with its type in source order.
