---
markset: 0
title: Future requirements
---

# Future requirements

A running register of things real documents have asked for and v0 does not do. It is deliberately not a roadmap: an entry here is a recorded observation with a recommendation, not a commitment.

This is the open counterpart to spec §8. That list is closed and settled: seven constructs deferred with reasons, named so they are not relitigated during v0. This list is open, and an entry earns its place by being something a document actually needed, with a note saying which document and when.

**Adding an entry.** Say what was wanted, where it came from, what it would cost, and which change class it falls in. An entry with no originating document is a feature idea, and feature ideas belong in §8 or nowhere.

## Change classes

The class decides where a change can land. Spec §0 defines the policy; this table is the working summary.

| Class | Touches | Lands in |
|---|---|---|
| Output | Rendered HTML or CSS only. The `html` aspect is reference output, not normative (§7), so pinned expectations may be updated with the change. | v0 |
| Additive | A new diagnostic, theme token, or reserved class; a clarification that does not change the parse of any existing case. | v0 |
| Breaking | Changes an existing case's `ast`, `valid`, or `diagnostics`, or changes how any existing document parses. | v1 |
| Rejected | Recorded with the reason, so it is not raised again without new evidence. | never |

## Open entries

### 1. A real table caption

**Class: Output. Recommended.**

A captioned data table is the most common single element in the kind of document Markset is for, and both long examples needed one. Today the only route is `figure`, which wraps the table and emits `<figcaption>` after it. That renders correctly but is the wrong structure: `<caption>` is a table's own accessible name and is announced as such, while a `figcaption` beside a table is not.

The fix needs no new construct and no grammar change. When a `figure`'s content is a table, emit the caption as the table's first child, `<table><caption>…</caption>`, instead of a sibling `figcaption`. The AST does not move. The `figure` element stays as the box that carries `id` and `width`.

Cost: one renderer branch, the `html` expectations on the figure cases that use a table, and a sentence in §4.8.

Observed: `examples/strategy-read.md`, September 2026.

### 2. Accessible names and roles in rendered output

**Class: Output. Recommended, in pieces.**

Nothing in the rendered HTML is wrong for assistive technology, but several constructs give less than they could, and none of it costs an author anything:

- GFM table header cells emit a bare `<th>`; they should carry `scope="col"` or `scope="row"`.
- The tabs construct is radio inputs and labels with no `role="tablist"`, `role="tab"` or `role="tabpanel"`, so it is announced as a form control group rather than as tabs.
- Step markers are decorative counters that are announced as content.
- A callout's type is conveyed by a `data-type` attribute and a visual title; a screen reader gets the title text but no indication that the block is an aside.

Each is independent, so they can land one at a time with a conformance case each.

Observed: `examples/strategy-read.md`, September 2026, which in its original form used `aria-labelledby` throughout and had no way to say so in Markset.

### 3. A named accessible label on constructs

**Class: Additive if the field is omitted when unset, Breaking otherwise. Candidate.**

Entry 2 covers what a renderer can infer. It does not cover what only the author knows: which of five `tabs` groups is the installation one, what a `figure` shows for someone who cannot see it. The Markset-shaped answer is a named attribute on the constructs that can take one, `label="Installation methods"`, mapping to `aria-label`, rather than letting authors write `aria-*` keys directly (see Rejected, below).

It is additive only if the AST node gains the field just when the author sets it. If every `tabs` node gains `"label": null`, every pinned case changes and it becomes a v1 change. Decide that before writing any code.

### 4. Table cells that span rows or columns

**Class: Breaking. No recommendation yet.**

Real reports want a header spanning two columns. GFM tables cannot express it, and neither can Markset. Invariant 5 says reuse convergent syntax, and there is no convergent syntax here: Pandoc has grid tables, MultiMarkdown has its own spelling, and neither renders on GitHub. Inventing one would break the degradation contract, since a spanning table has no honest plain-CommonMark form.

Recorded so the gap is known. Revisit only if a convergent syntax emerges or a document genuinely cannot be written without it.

### 5. Footnotes and citations

**Class: Breaking. Candidate for v1.**

Both long examples ended up hand-rolling citations as a small trailing paragraph with a class. That works and reads acceptably, but it is a workaround for a missing primitive, and a document with twenty citations would not survive it.

GFM footnote syntax is the convergent spelling and GitHub renders it natively, so this satisfies invariant 5 cleanly. It is breaking because `[^1]` is literal text today, so adopting it changes how an existing document parses.

Observed: `examples/notification-routing.md` and `examples/strategy-read.md`, September 2026.

### 6. Heading anchors in the HTML renderer

**Class: Output. Recommended.**

The site generator assigns heading ids so the specification page can have a table of contents. The HTML renderer does not, so anyone rendering with the CLI gets a document whose sections cannot be linked. Moving the id assignment into the renderer, or offering it as an option, removes a piece of machinery every consumer would otherwise rewrite.

### 7. Reserved classes observed in real documents

**Class: Additive. Wait for a third document.**

Section 5 reserves seven classes, and adding more is explicitly additive in v0. Two long documents have now been written, and they independently invented the same two roles: a quiet monospaced label heading, and a list whose items read as notes rather than as a checklist, spelled `.facts` in both. Both also used `.eyebrow`, which is already reserved, which is the evidence that the reserved set is doing its job.

Two is a coincidence. Three is a pattern. Revisit after the next document rather than promoting these now.

### 8. A responsive breakpoint as a theme token

**Class: Additive. Weak.**

The default stylesheet collapses `columns` to a single lane below 36rem. Both example themes overrode that, because a lopsided ratio stops being readable long before a balanced one does. A theme token would make the override declarative instead of a media query in every theme.

Weak because a theme stylesheet overriding a stylesheet rule is not a problem that needs a token to solve.

### 9. Right-to-left and localized documents

**Class: Output. Unexamined.**

No page has been rendered in a right-to-left language. The stylesheet uses logical properties in some places and physical ones in others, so it is likely partly wrong. Recorded because nobody has looked, not because a document asked.

### 10. Syntax highlighting

**Class: Output. Out of scope for the spec.**

The renderer emits `<code class="language-js">`, which is what every highlighter expects, so this is already solved for anyone who wants it. Recorded only to say so, since it is the first thing people ask for.

## Rejected

| Request | Reason |
|---|---|
| Arbitrary `aria-*` and `role` keys in attribute specifiers | An author writing raw ARIA can produce something worse than no ARIA, and it is an implementation detail rather than authorial intent, which invariant 1 rules out. Entry 3 is the shape this should take instead. |
| Hand-tuned line breaks in titles | Where a heading wraps is the theme's business, and a non-breaking space can be typed directly when it genuinely matters. |
| A `caption` construct | Entry 1 gets a real caption with no new construct. A second way to caption a table would violate invariant 3 for no gain. |
