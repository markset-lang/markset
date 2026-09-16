---
markset: 0
title: Future requirements
---

# Future requirements

A running register of things real documents have asked for and v0 does not do. It is deliberately not a roadmap: an entry here is a recorded observation with a recommendation, not a commitment.

This is the open counterpart to spec §8. That list is closed and settled: seven constructs deferred with reasons, named so they are not relitigated during v0. This list is open, and an entry earns its place by being something a document actually needed, with a note saying which document and when.

**Adding an entry.** Say what was wanted, where it came from, what it would cost, and which change class it falls in. An entry with no originating document is a feature idea, and feature ideas belong in §8 or nowhere.

## The bar for a new construct

Most entries below are not constructs, and that is not an accident. Section 8 lists what was deferred and why; this is the test an entry has to pass before it can be considered at all.

**A need justifies a construct only when it cannot be met by a class, because it requires independent renderers to agree on structure rather than on appearance.**

The reasoning is what makes it usable. A class is portable in syntax and not in meaning: `{.featured}` reaches the HTML of every conformant renderer, but what it *is* lives in one stylesheet, so two implementations cannot agree about it and nothing can validate it. A construct is the opposite trade — a fixed name, a content rule, a defined fallback and a place in the conformance suite — bought at the cost of one more thing in a vocabulary whose whole value is being closed.

So the question for any proposal is not "would a construct be nice here" but "does this need renderers to agree?" Three worked answers:

- **A tinted pipeline stage, a pull quote, a status chip.** Appearance. Every one of them is a class, and `notification-routing.md` and `strategy-read.md` between them invented fifty of these. None is a construct.
- **A timeline.** Structure, but structure that already exists: it is an ordered list of things that happened, which is what `steps` is. `incident-review.md` is the evidence — the rail and the markers are the theme's, and the document never mentions them. Not a construct.
- **A chart.** Structure that nothing else expresses, because the output is computed from the data rather than styled from the content. A stylesheet cannot draw it and a second renderer cannot guess it. This is the one candidate in §8 that clears the bar, and it is still deferred for the reasons given there.

An entry that fails the test is not thereby rejected — it may well be a good idea about output, tooling or the reserved set. It is only barred from being a ninth name.

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

**Class: Output. Done, September 2026.**

A captioned data table is the most common single element in the kind of document Markset is for, and both long examples needed one. Today the only route is `figure`, which wraps the table and emits `<figcaption>` after it. That renders correctly but is the wrong structure: `<caption>` is a table's own accessible name and is announced as such, while a `figcaption` beside a table is not.

The fix needs no new construct and no grammar change. When a `figure`'s content is a table, emit the caption as the table's first child, `<table><caption>…</caption>`, instead of a sibling `figcaption`. The AST does not move. The `figure` element stays as the box that carries `id` and `width`.

Cost, as built: one renderer branch, one pinned expectation, two stylesheet rules and a sentence in §4.8. The caption is placed below the table with `caption-side`, so nothing moves visually.

Observed: `examples/strategy-read.md`, September 2026. Kept here rather than deleted, as the worked example of an entry that resolved without a new construct.

### 2. Accessible names and roles in rendered output

**Class: Output. Done, September 2026, with one item refused.**

Nothing in the rendered HTML was wrong for assistive technology, but several constructs gave less than they could, and none of it costs an author anything. Three of the four are built. The fourth turned out not to be free, and refusing it is the more interesting result.

- **Table header cells now carry `scope="col"`.** A bare `<th>` leaves a screen reader to guess which cells it heads. A GFM table has one header row and no row headers, so the renderer always knows the answer and the author never writes it.
- **A callout is `role="note"`, named by its title** through `aria-labelledby`. It is ancillary to the main content, which is what `note` means. The folding form keeps its `<details>` and takes no role: a role there would replace the disclosure semantics, which tell a reader the more useful thing.
- **Step markers are decoration again.** The number is already carried by the `<ol>`; the CSS counter repeated it, and some screen readers read it out twice. The generated content now has empty alternative text, with the plain declaration left in front as the fallback for a browser that does not understand the alt syntax.
- **Tabs are named but take no roles.** Each panel is `aria-labelledby` its label. `role="tablist"`, `role="tab"` and `role="tabpanel"` are refused.

**Why the tab roles are refused,** because it looked free when this entry was written and it is not. The tablist pattern requires `aria-selected` to follow the active tab. That is dynamic state. Markset's tabs are radio inputs precisely so that nothing has to run, and a static `aria-selected` frozen at the initially checked tab would tell assistive technology something false about every other tab, forever. That is worse than radio buttons, which are at least honestly described. Invariant 4 makes the script that would fix it unavailable, so the honest output is the one that claims less.

This is the first place an invariant has cost the project something real rather than merely ruling out a bad idea, and it is worth having written down as such.

Cost, as built: one tree pass for `scope`, two handler changes, one CSS declaration, ten pinned `html` expectations, seven tests, and three paragraphs in §4.

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

**Class: Output. Done, September 2026.**

The site generator assigned heading ids so the specification page could have a table of contents. The HTML renderer did not, so anyone rendering with the CLI got a document whose sections could not be linked. That is a piece of machinery every consumer would have rewritten.

Built as `addHeadingIds` in `@markset-lang/render-html`, applied by `renderHtml` unless `headingIds: false` is passed. It sets `attributes.id` on heading nodes rather than writing ids at the HTML stage, so a caller that needs the ids for something else — a table of contents, as the site does — reads them off the tree it renders, and the two cannot disagree. The site's own copy was deleted.

Two things the site's version got wrong and this one does not. It slugged with an ASCII character class, so a heading in any language that is not English collapsed to `section`, and a document of them collapsed to `section`, `section-2`, `section-3`; the slug is now Unicode-aware, which is also most of what entry 9 would have asked for here. It also visited only top-level headings, so a heading inside a `steps` or `grid` item was not linkable.

Cost, as built: one module, five pinned `html` expectations updated, seven unit tests, one paragraph in §2.1.

Observed: raised September 2026 while reviewing the site against the CLI.

### 7. Reserved classes observed in real documents

**Class: Additive. Decided, September 2026: promote nothing.**

Section 5 reserves ten classes and adding more is explicitly additive in v0. The question was whether real documents keep inventing the same roles. Four now exist, so it can be answered by counting instead of guessing.

:::figure[Author classes invented by each example, excluding the reserved ones and the site's own. A class appears in the last column only if a second document invented it independently.]
| Document | Classes invented | Shared with another document |
|---|---|---|
| `notification-routing.md` | 34 | `.facts`, `.colophon` |
| `strategy-read.md` | 16 | `.facts`, `.colophon` |
| `incident-review.md` | 3 | none |
| `showcase.md` | 1 | none |
:::

Fifty-four invented classes across four documents, and exactly two of them were invented twice. Everything else was genuinely particular to one document — `.layer`, `.verdict`, `.pull`, `.impact`, `.when` — and no amount of reserving would have helped, because a second document does not want them.

The two that repeat do not clear the bar either. `.colophon` marks the closing source note, which three of the four documents have; the fourth wrote `{.small .muted}` instead and reads identically, so reserving it would add a second spelling for something the reserved set already says. `.facts` is a real role — a list read as notes rather than as a checklist — but the third and fourth documents did not reach for it, so the pattern got weaker rather than stronger.

The useful finding is the one that was not the question. The document that invented the fewest classes is the newest, and it is not the simplest: `incident-review.md` needed three, because the reserved set plus a theme stylesheet covered the rest. That is the closed-vocabulary argument holding up under its own test — documents invent freely at the class level, and what they share is already reserved.

**Criterion for next time,** so this is not re-litigated by taste: a class earns reservation when three documents invent it independently *and* the reserved set cannot already express it. `.facts` meets neither half today. Revisit at document six.

**Document seven, September 2026: zero.** `examples/architecture.md` invented no author classes at all. Its theme styles `.ms-figure`, `.ms-diagram` and the reserved `.eyebrow`, and the document names nothing else. That is the strongest version of the finding above — the document with the most distinctive look of the seven is the one that asked the vocabulary for the least, because what it needed was a construct's own class and the reserved set. Nothing to promote.

Observed: `notification-routing.md` and `strategy-read.md`, September 2026; decided against `incident-review.md` and `showcase.md` in the same month.

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

One case is worth naming because it is not really highlighting. `incident-review.md` shows a configuration diff, and the added and removed lines cannot be colored by any stylesheet, because a code block's lines are text with no elements around them. A theme can reach a construct, a block, a list item and a span; it cannot reach a line. Anyone who wants colored diffs needs a highlighter, exactly as for any other language, and that remains outside the spec.

### 11. A light and dark mode toggle

**Class: Output. Done, September 2026.**

Every page followed `prefers-color-scheme` and had no way to override it. A reader whose system is dark could not read a page in light, which matters for anyone checking how a document will print or sharing a screen.

The obvious implementation is a script, and the site has none by design: a test asserts that no built page contains one, and the home page claims as much. The constraint turned out to be the design. The default stylesheet now writes each color once as `light-dark(light, dark)` and resolves it through `color-scheme`, so following the system and forcing a scheme are the same mechanism rather than two palettes to keep in sync, and `@media (prefers-color-scheme: dark)` is gone from the stylesheet entirely. Forcing is one property: §6 defines `data-scheme` on `<body>` for a renderer or chrome to set. Printing forces light, which also fixed a real bug — a reader who chose dark used to print a dark surface with pale borders.

The site's control is three radio inputs in the app bar with `body:has()` reading them. Auto is checked, so a reader who never touches it keeps their system preference. `color-scheme` also makes form controls and scrollbars match, which the old media query did not do.

What it does not do: the choice lives in the markup, so it does not survive a page load. Persisting it needs `localStorage`, which needs a script, which is the thing not being given up. Recorded rather than hidden.

Cost, as built: ten tokens rewritten, two rules for the hook, one shell fragment, eleven lines of site CSS, a paragraph in §6.

Observed: raised September 2026 while reviewing the site.

### 12. A left navigation rail on more than the specification

**Class: Output. Recommended.**

The specification page has a sticky table of contents and every other long page does not. The guide index, the CLI page and both long examples are now long enough to want one, and the machinery already exists in the generator.

The work is deciding which pages get it, since a rail on a short page is clutter, and making the rail collapse on a narrow screen the way the specification's already does.

Observed: raised September 2026 while reviewing the site.

### 13. A linter and formatter

**Class: Tooling. Done, September 2026.**

There was no lint step and no formatter. Style was whatever each file ended up with, and the only automated check on the source was the type checker. Biome: one binary, one configuration file, TypeScript and JSON and CSS in the same tool.

**The decision worth making deliberately was whether it gates continuous integration.** It does. A formatter nobody enforces is a formatter nobody runs, and the repository is small enough that the cost of a failed build over formatting is a few seconds of `npm run format`.

Two exemptions, both recorded in the config next to the rule rather than in anyone's memory. The stylesheets keep their one-rule-per-line style: `markset.css` is mostly token declarations, a formatter that explodes each rule over three lines triples its length, and two tests pin exact rule text. And `tests/*.json` is generated by `JSON.stringify` with two spaces, so a formatter that disagreed would fight every regeneration.

Three lint rules are off with their reasons in the config: non-null assertions, which here always sit behind a check the compiler cannot see through; `!important`, which a theme stylesheet uses deliberately to beat a default-stylesheet margin; and descending specificity, which is what layering a theme over a default stylesheet looks like when it is working.

**One thing to know, because it cost an hour.** A `//` comment inside `biome.json` does not fail. Biome drops the members that follow it in that object, silently, so the file reads as configured and is not — two rule overrides and the line width vanished that way and nothing said so. The file is `biome.jsonc`, where comments are supported, and a test asserts the settings survive parsing rather than trusting that they do.

Cost, as applied: 34 files reformatted, 14 lint findings fixed, one shadowed global renamed, and one `forEach` callback that was implicitly returning a value.

Observed: raised September 2026.

### 14. Structured metadata on a list item

**Class: Breaking if the AST carries it. Observed, not recommended yet.**

Every action in `incident-review.md` has an owner, a due date and a status, and all three are written as a bold line inside the step: `**Owner: … · Due 5 September · Done**`. That is prose pretending to be fields. Nothing can sort it, no stylesheet can align the columns, and a second renderer sees a sentence.

The obvious answer is that the attribute specifier already allows it — `- {owner="Priya" due="2026-08-29" status=done}` reaches the HTML as `data-` attributes today, with no change to anything. That is genuinely available and the document could have used it. It was not used because the values would then be invisible in every fallback: the whole point of the degradation contract is that a GitHub comment shows the document, and `data-owner` shows nothing there.

So the real request is a construct that renders its own attributes, and that is a much larger idea than it looks: it is a field schema, which is Markdoc's design, and it would put presentation decisions about field order and labels somewhere. Recorded because two documents will want it before one of them needs it, and because the reason it is hard is the interesting part.

Observed: `examples/incident-review.md`, September 2026.

### 15. Diagrams

**Class: Additive. Done, September 2026.**

Nothing drew a diagram. A document could always *write* one — a fenced code block is CommonMark and `figure` has always taken a code block as its content — and `markset check` was happy, and the downgrade was clean. What was missing was an answer to what a renderer should do with such a fence, which meant two renderers could reasonably do different things with the same document. That is precisely the interop gap the project exists to close, so the gap was in the spec rather than in the grammar.

**No construct, and the reasoning is the bar in this file.** A `:::diagram` directive would have to justify itself by making independent renderers agree on structure. They already agree: it is a code block with an info string, and every conformant renderer already produces `<pre><code class="language-…">` from it. A construct would have bought nothing and cost a ninth name in a vocabulary whose value is being closed. The five conformance cases pin exactly that — the AST of a diagram is `figure` around `code`, and there is no diagram node.

Settled as spec §10, with seven renderer obligations. Two are worth repeating here.

**Obligation 7: a renderer must not draw a diagram it has no text alternative for.** This one has teeth, and it is the second time an invariant has cost the project something rather than merely ruling out a bad idea. An undrawn diagram is a code block, and a reader using a screen reader gets its source: mediocre, but present. Draw it with no alternative and that reader gets nothing, so drawing would remove content for them while adding it for everyone else. The caption is the alternative, and `figure` is the only place a fence can carry one — so a diagram outside a captioned figure is rendered as a code block however capable the renderer is. Same shape as §4.5's refusal of tab roles.

**The drawn form is an `<img>` holding an SVG data URI, not inline SVG.** Inline markup would be smaller and themeable from the page. It was refused because §4 says raw HTML in the source is never passed through, and an engine — on the CLI path, an arbitrary command the operator named — should not get a channel that documents are denied. An SVG loaded through `<img>` cannot execute script, so obligation 6 holds by the shape of the output rather than by trusting the engine. The cost is real and accepted: a data URI is bulkier and the page cannot restyle the picture.

**Drawing is on by default for `ascii` only, and the document never chooses the engine.** The default was made on after the first implementation landed: an ASCII fence drawn and an ASCII fence left alone are the same picture, so drawing it changes how it looks rather than what it says, and a library that quietly differed from the command line would be the worse outcome. Every other language stays opt-in, because every other language falls back to its own source code and drawing one by default *would* change what a document shows. Turning drawing off is `--diagram none`, added in the same change — before it, "off" needed no switch because off was the default. `markset html --diagram <lang>=<command>` maps an info string to a command; the fence reaches the command on stdin and never gets interpolated into it. So nothing written in a Markset file can cause anything to run, which is the part of invariant 4 that matters — the operator opting into a build step is the same choice they already made by running `markset` at all. A test asserts it.

**ASCII is the recommended source, and this is the part that is about Markset.** Section 3 requires a document to read where the layout cannot follow. A `mermaid` or `dot` fence falls back to its own source code: honest, and not a diagram. An ASCII fence falls back to a diagram, because it already was one — in a GitHub comment, in a terminal, in `markset downgrade` output, in a diff. Of the common diagram sources it is the only one whose naive output is as good as its rendered output, which makes it the one that fits the degradation contract rather than merely surviving it.

That argument is strong enough that the repository ships one engine, `@markset-lang/diagram-ascii`: a pure string-to-string function with no dependencies, which is why it does not strain invariant 4 any more than the downgrade renderer does. It reads the character grid, joins runs of `-` and `|`, treats `+` as a corner, and puts an arrowhead where a line actually arrives — the rule that stops the `v` in "very" from sprouting a triangle. It carries its own `prefers-color-scheme` block, which resolves against the embedding page's `color-scheme`, so a drawn diagram follows §6's `data-scheme` like everything else; that propagation was measured in Chrome rather than assumed. It is deliberately not svgbob: no shape detection, no rounded corners, no layout. Anyone who wants those points `--diagram` at a tool that has them.

**One thing that turned out not to be broken.** The suspicion that opened this entry was that a forced color scheme could not reach an SVG loaded through `<img>`, leaving a dark diagram on a light page. Measured instead of asserted: page forced light gives a white pixel, forced dark gives a black one. The embedding page's `color-scheme` does propagate, `examples/degrade.svg` was correct all along, and the comment inside it that says so is right. Recorded because it was the premise of a different and worse design.

**The seventh document is what tested it.** `examples/architecture.md` was written after the feature was built, and it found three things the feature's own tests had not, which is the usual result and the reason the examples exist. A line arriving at a box stopped half a cell short of it. A lone hyphen in a label — `region: us-east` — was drawn as a rule, turning a word into two words joined by a line. And `.ms-figure` was not `border-box` despite carrying an explicit width, so the theme's padding around a diagram pushed three figures past a 390px viewport. None of these is visible in a unit test of the engine; all three are obvious in a page.

**Two corrections after the first readers, September 2026.** The feature was documented and still not findable: the reference index listed diagrams as a trailing note under the eight constructs, so the page existed and was reported missing. Being linked is not the same as being where someone looks. And "engine" was used eighteen times across the spec, the reference page, the CLI page and an example without once being defined — a coinage introduced as though it were common vocabulary. Both are writing defects rather than design ones, and both were found by someone reading the site rather than by any test, which is worth remembering the next time a feature looks finished.

**The site draws mermaid, at a real cost.** `@mermaid-js/mermaid-cli` pulls puppeteer and a Chromium download, which is out of proportion to everything else in this repository. It was accepted because a page arguing that the language set is open should show a second language rather than describe one. The blast radius is contained deliberately: it is a dev dependency of the workspace root, used only by `site/mermaid.ts`, and a test asserts no package reaches for it, so nobody consuming the renderer installs a browser. mermaid has no `prefers-color-scheme` switch of its own, so each diagram is rendered twice in mermaid's own light and dark themes and spliced into one picture — the same mechanism as the ASCII engine, paid for twice.

Cost, as built: one spec section, one workspace package, one renderer pass, one CLI flag, five conformance cases, 36 tests, three stylesheet rules, a reference page, a worked example, one heavy dev dependency and a CI cache step.

Observed: requested September 2026. The standing evidence was `examples/degrade.svg`, a hand-maintained SVG carried beside `showcase.md` by a line in the site generator, which is the thing a diagram fence removes the need for.

### 16. A recipe for publishing to GitHub Pages

**Class: Tooling and documentation. Done, September 2026.**

The adoption page had listed "a public site or GitHub Pages" as one of four things Markset is good for, and said only that this site is the worked example. That is a promise with no path behind it: the reader who wants it has to reverse-engineer `site/build.ts`, which is six hundred lines and is not the minimum.

Written as `site/content/github-pages.md`, and the useful part is what writing it forced, which is the same pattern the real documents established for the spec.

- **`markset css`.** The recipe wants one stylesheet linked by every page rather than inlined into each one — 24 KB a page against 0.5 KB. `--css <href>` already accepted a URL to link, and there was no way to produce the file it pointed at except by knowing a path inside the package. The command that emits it did not exist, and the option was therefore unusable as documented.
- **An unknown command is now reported as one.** The missing-file check ran before the command was dispatched, so a typo answered "a file is required". Found because a test asserted every command named in the guide exists, and the assertion passed for a command that did not.

**The blocker was never documentation, and it is gone.** The recipe's first line should have been `npm i -g @markset-lang/cli` and could not be: every package was `private: true`, so the workflow checked this repository out and ran the CLI from source — one ugly step in an otherwise short recipe, and a reader's build depending on our internal layout. Publishing on 16 September 2026 collapsed it to exactly that line, and took `--omit=dev` out of the recipe with it: mermaid's headless browser is a development dependency of this repository, which a published package never carries, so there is no longer a large download to omit. The tip in that slot now argues for pinning the version instead.

What is left in it is the general lesson rather than the Markset one: documentation can be blocked by packaging, and writing the page is what proves it. Two commands that did not exist (`markset css`, and reporting an unknown command as one) were found by writing prose, and the last ugly line was fixed by shipping.

Observed: raised September 2026, on the grounds that it is likely to be the common case.

## Rejected

| Request | Reason |
|---|---|
| Arbitrary `aria-*` and `role` keys in attribute specifiers | An author writing raw ARIA can produce something worse than no ARIA, and it is an implementation detail rather than authorial intent, which invariant 1 rules out. Entry 3 is the shape this should take instead. |
| Hand-tuned line breaks in titles | Where a heading wraps is the theme's business, and a non-breaking space can be typed directly when it genuinely matters. |
| A `caption` construct | Entry 1 gets a real caption with no new construct. A second way to caption a table would violate invariant 3 for no gain. |
