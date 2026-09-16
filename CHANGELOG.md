# Changelog

## Unreleased

- **Diagrams, as spec §10.** A diagram is a fenced code block whose info string names a diagram language — not a construct, and there will not be a `:::diagram` directive. A fence has always been writable, checkable and downgradable; what was missing was an answer to what a renderer may do with one, so two renderers could reasonably differ on the same document. Seven obligations settle it. The grammar does not change, and neither does the AST of any existing document: five conformance cases pin that a diagram parses as `figure` around `code`, with no diagram node.
- A diagram is drawn only inside a captioned `figure`. An undrawn diagram is a code block, so a reader using a screen reader gets its source; drawing it with no text alternative would take that away from them while giving the picture to everyone else. The caption is the alternative and `figure` is the only place a fence can carry one, so a fence anywhere else renders as a code block however capable the renderer is.
- **ASCII fences are drawn by default**, by `renderHtml` and by `markset html` alike, so the library and the tool cannot disagree about what a document looks like. Only `ascii` is on: it is the one source that falls back to a diagram either way, so drawing it changes how a fence looks and not what it says. `--diagram none` (or `diagrams: false`) keeps every fence as code, which is what an author wants when a fence is meant to stay selectable text, and `<lang>=<command>` adds a language by running a command with the fence on stdin and SVG on stdout — layered over the built-in drawer, so naming one language never silently removes another. A command that fails, or prints something that is not SVG, leaves the code block in place and reports to stderr — a failed diagram never removes content. The document never names the drawer and the fence never reaches the command line, so nothing in a Markset file can cause anything to run.
- `@markset/diagram-ascii` draws ASCII diagrams, with no dependencies. ASCII is the recommended source because it is the only common one whose fallback is still a diagram: a `mermaid` fence degrades to its own source code, an ASCII fence degrades to the picture it already was. It follows the reader's color scheme through its own `prefers-color-scheme` block, which resolves against the page's `color-scheme`.
- The drawn form is an `<img>` holding an SVG data URI rather than inline SVG. Raw HTML from a document is never passed through, and a drawer — on the command line, an arbitrary command — should not get a channel documents are denied. An SVG loaded through `<img>` cannot execute script, so the output is inert by its shape rather than by trusting the drawer.
- Conformance cases for diagrams pin the *undrawn* form even though the reference implementation draws by default. A drawn diagram is an implementation's own SVG and could never be a shared expectation; §10 obligation 1 makes the code block the form every conformant renderer agrees on.
- **`examples/architecture.md`, with `examples/tidewater.css`** — a system map, a state machine and a deployment topology, each an ASCII fence rather than an image file kept in step with the prose by hand. One fence is deliberately left as a code block, because the characters are the content rather than a picture of them.
- Writing it found three defects that the feature's own tests did not. A line arriving at a box stopped half a cell short of it, so arrows pointed *near* boxes rather than touching them; a run now continues to the center of the line it meets. A lone hyphen inside a label was drawn as a rule, so `region: us-east` came out as two words joined by a line; a single `-` or `|` between word characters is now text, while two or more in a row is still a connector. And `.ms-figure` was not `border-box` despite carrying an explicit width, so a theme that padded a figure pushed the page sideways at phone width — three figures overflowed a 390px viewport before the fix, and all 39 pages fit after it.
- The examples index is a card grid rather than a bulleted list. Seven multi-sentence bullets had become a wall of near-identical paragraphs with the links buried mid-sentence, on the page that is the way in to the best content on the site. Each example is now a card with a linked title, a tightened blurb and one footer line carrying its genre, its theme and a link to the source; the construct tour is lifted out as a featured card, because it is a tour rather than a document. The listing is generated as Markset source and rendered, instead of assembled as HTML, so the index dogfoods `grid` and the claim that every page on the site is a Markset document stays literally true.
- The intro to that page no longer says "the second example", which named a document by its position in a generated list and silently became a different document when one was inserted above it.
- Two places now show a `mermaid` fence rather than only describing one. The diagrams reference puts the same three-node graph side by side as mermaid and as ASCII, so §10's argument is visible instead of asserted: this site registers a drawer for one of them, and the other is its own source. `examples/architecture.md` carries a mermaid sequence diagram in a captioned figure, which stays a code block here and becomes a picture the moment a mermaid drawer is given, with no change to the document.
- **The site draws mermaid.** `@mermaid-js/mermaid-cli` is a new dev dependency, approved for this, and it is the heavy one: it pulls puppeteer and a Chromium download. It is used by `site/mermaid.ts` and nothing else — no package depends on it, a consumer of the library never installs it, and a test keeps that true. The Pages workflow caches the Chromium download against the lockfile and passes a puppeteer config, because Chrome's sandbox is unavailable in most CI containers and without it the build fails at the first diagram.
- mermaid bakes a theme into the SVG it emits and has no `prefers-color-scheme` switch, so a single render is readable in one scheme and poor in the other. Each diagram is rendered twice, with mermaid's own light and dark themes, and both are spliced into one picture that shows whichever half matches. It is the same mechanism the ASCII drawer uses, paid for twice, and each render gets its own svg id so the two style blocks mermaid writes cannot collide.
- A drawer that fails now fails the site build rather than falling back. §10's fallback is right for a renderer that does not know what the page says; these pages state that their diagrams are drawn, so shipping a code block instead would make the site contradict itself.
- **"Drawer" is defined before it is used.** The word was introduced across the specification, the reference page, the CLI page and an example without ever being explained — eighteen uses, no definition. A drawer is what turns a diagram fence into a picture: a function built into the renderer, or a program it runs. Said once in §10 and once at the top of the reference page, and glossed at first use elsewhere.
- Diagrams are findable. The reference index listed its two non-construct pages as trailing notes under the eight constructs, which is not where a reader looking for diagrams looks — the page existed and was reported missing. They have a heading and a list of their own now, and the home page, the adoption page and its constraints table each say that diagrams exist and what they need.
- A drawn diagram keeps its size and its figure scrolls, rather than being scaled down to fit a phone. Line art shrunk to a third of its size is line art nobody can read; this is the trade tables and code blocks already make, and the page itself still never scrolls sideways.
- Vertical rhythm: `figure` and `hr` were missing from the margin reset, so they kept a browser default bottom margin measured in `em` rather than in `--ms-space`. A figure sat 15px below itself against a 10px rhythm at compact density, and matched at the other two only because the token was larger and collapsed over it.
- An explicit `density` now applies on every preset. `deck` and `report` set `--ms-space` themselves and their rules came after the density rules, so a document that declared `density: compact` alongside either of them silently got the preset's spacing and the token did nothing. `examples/runbook.md` was rendering at the report preset's spacing rather than the compact one it asks for.
- Callouts, cards, metrics, tabs and grids take one and a half spacing units above and below instead of one. Two lines of prose are separated by their leading as well as by the margin, so the gap that reads as comfortable between paragraphs reads as tight against a border, which has no optical padding of its own. A heading on either side is excluded so it keeps its own rhythm.
- A figure's caption takes a full spacing unit rather than half of one, and the block after a figure takes two. At half a unit the caption sat against the table's bottom rule and was nearly as far from the next block as from the table it belongs to, so it read as floating between them. The ratio is what matters and both sides scale with the density token.
- The site's section divider takes `margin-block` rather than `margin-top` alone. It was three units below the section it closed and one above the next, and looked symmetric only where an eyebrow followed and supplied a matching top margin of its own.

## 0.1.0 — 2026-09-15

**v0 is declared.** The vocabulary is closed, the grammar is fixed, and changes from here are additive only: new diagnostics, new theme tokens, new reserved classes, clarifications that do not change the parse of any existing conformance case. Anything that would change an existing case's `ast`, `valid` or `diagnostics` belongs to v1, which will declare itself with a new `markset:` value. The `-rc.N` exception that allowed a breaking change during the candidate period is gone.

The candidate period existed to write real documents against the spec and find out what broke. Six were written, all describing invented systems. The first two forced §2.5 list-item attributes and the §6 theme stylesheet hook; the third forced a real `<caption>` in §4.8. The last four forced nothing in §2 or §4 — a strategy memo, an incident review, a configuration reference and an on-call runbook — and that is the condition this release was waiting on.

What the six did produce is fourteen entries in `docs/future-requirements.md`, and not one of them is a construct. Four are closed: a real table caption, heading ids, a light and dark toggle, and the accessibility pass below. One was closed by counting and deciding against it. The rest are v1's problem.

- Accessibility in rendered output, none of which an author writes: table header cells carry `scope="col"`, a callout is `role="note"` named by its title through `aria-labelledby`, each tab panel is named by its label, and the step marker's CSS counter has empty alternative text so it is not announced on top of the list numbering it repeats. Tab roles are deliberately absent — see §4.5.

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
