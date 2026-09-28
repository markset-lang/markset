# Decisions

A running log of decisions that would otherwise get relitigated. Each entry records what was decided, why, and what was rejected. Append; don't rewrite history. If a decision is reversed, add a new entry that supersedes the old one rather than editing it.

---

## D1 — Build a component vocabulary, not another syntax

**2026-09-13**

The syntax problem is substantially solved. Attribute specifiers, fenced divs, and generic directives were invented independently by Pandoc, djot, MyST, Docusaurus, and remark-directive, and have clearly converged. What does not exist is a portable *component vocabulary* and theme model that multiple renderers agree on — every platform's callout syntax is invisible to every other platform's renderer.

Markset is that vocabulary. It is not a new syntax layer.

**Rejected:** designing novel markup. Inventing a fourth spelling of the same three constructs is the most reliable way to make the project irrelevant.

**Honest caveat:** Quarto plus a custom theme delivers roughly 80% of this today across HTML, PDF, and Typst. If the goal were rich documents rather than a portable open format, adopting Quarto would be the correct answer. Revisit if the format ambition ever drops.

---

## D2 — Superset of CommonMark, reusing convergent syntax

**2026-09-13**

Attribute specifiers `{#id .class key=val}`, fenced block directives `:::name`, and bracketed spans `[text]{.class}`. All three have multiple existing implementations.

**Rejected:** Markdoc's `{% tag %}` (good semantics, unnecessarily distinct spelling), MyST's `{directive}` backtick form (reads as code, degrades worse), raw HTML passthrough (breaks non-HTML targets, unsafe with untrusted authors, strips under sanitizers).

---

## D3 — Callouts adopt GitHub/Obsidian syntax unchanged

**2026-09-13**

`> [!NOTE]` with optional title and `-`/`+` fold indicators. This is the most widely rendered rich-Markdown construct in existence by install count.

**Rejected:** a `:::callout` directive, for consistency with the rest of the vocabulary. Consistency is not worth losing native rendering on GitHub, Obsidian, and everything downstream of them.

---

## D4 — Closed vocabulary with schema validation

**2026-09-13**

Unknown directive names are validation errors. Diagnostics are part of the conformance suite, not an afterthought.

Borrowed from Markdoc, which validates typed tags against a schema before render. This is what makes documents statically checkable, and it is also what makes the format reliable for generated output — a constrained tag set is far easier for a model to emit correctly than freeform HTML or Tailwind.

**Rejected:** open extension in the MDX style. Maximum power, but it couples content to a runtime, defeats validation, and turns content into code.

---

## D5 — No code execution, ever, in the core spec

**2026-09-13**

Invariant, not a v0 scoping decision. Interactivity, if it ever happens, is a separate optional spec built on declarative bindings over the document's own data — never arbitrary script.

The moment arbitrary JS is allowed, the project has rebuilt MDX and lost portability, validation, and safety in one move.

---

## D6 — Degradation is a normative requirement

**2026-09-13**

Every construct defines a CommonMark downgrade output *and* a readable raw-source fallback. Both are covered by conformance tests.

The practical consequence, and the thing that makes this real rather than aspirational: `grid`, `steps`, and `metrics` each require exactly one list or table as their content, enforced as a validation error. Constraining the content shape is what guarantees the degradation instead of hoping for it.

---

## D7 — File extension is `.md`

**2026-09-13**

Activation via `markset: 0` in frontmatter rather than a distinct extension.

`.mds` was the original candidate and is unusable. Every `.mds` file begins with the ASCII signature `MEDIA DESCRIPTOR` at byte 0 (Alcohol 120% / DAEMON Tools disc images), so type sniffers would misidentify Markset documents as binary. It is also claimed by TestComplete project settings and Wolfenstein skeletal meshes, npm `mds` is taken, and `dean0x/mdscript` actively uses `.mds` with an `mds build` CLI.

Beyond avoiding the collision, `.md` is the strongest possible expression of D6: every editor already highlights it and GitHub already renders it. MyST does the same. Cost: no branding surface on the extension.

---

## D8 — Name: Markset

**2026-09-13**

Telegraphs Markdown, names typesetting specifically rather than a generic craft metaphor, two syllables.

**Rejected:** Asterism, Pilcrow, Galley, Octavo, Rubric (all good, none telegraph Markdown); Marksmith (marksmith.org unavailable); Markwright and Markpress (both taken on npm, Markwright by a dormant 2018 package literally described as a Markdown typesetting component); XMD and Richdown.

**Known weakness:** "mark set" reads as a plausible commerce or marketing term — the top GitHub result for the name is a shopping app. Expect a permanent SEO headwind. This was accepted knowingly after markset.org was secured.

---

## D9 — Namespaces

**2026-09-13**

| Surface | Value | Note |
|---|---|---|
| Domain (canonical) | markset.org | The asset that matters |
| Domain (redirect) | markset-lang.org | 301 to markset.org |
| GitHub org | `markset-lang` | `markset` taken |
| npm org | `@markset-lang` | `markset` taken as both package and org |

The bare name is unavailable on npm — a dormant April 2019 package, single version `0.0.0-dev`, MIT, by `itisrazza`, described as "Markdown Typesetter. Perhaps a misnomer." Same idea, abandoned. The GitHub org and npm org are also taken.

Neither platform will release names for inactivity. GitHub's username policy states plainly that they do not accept reclaim requests on the basis that a name appears unused, and trademark complaints are the only route reviewed. npm's current policy says the same and confirmed in February 2026 that unused org names require a registered mark.

The `-lang` suffix is conventional for language and format projects (`rust-lang`, `ziglang`, `elixir-lang`), so this reads as idiomatic rather than as a workaround.

**Open:** emailing the 2019 npm owner to request `markset` is free upside. His contact address is in the registry metadata. Treat any result as a bonus.

---

## D10 — Single monorepo, not split spec and implementation

**2026-09-13**

`markset-lang/markset` holds `spec/`, `tests/`, and `packages/`.

In v0 the spec, conformance suite, and reference parser change in the same commit constantly — a construct's grammar, its test cases, and its parser branch are one thought. Splitting them means a two-repo dance for a project with one contributor, and agentic tooling is substantially more effective with spec, tests, and code in one tree.

**Rejected:** CommonMark's and MyST's split-spec layout. Correct once third-party implementers exist; premature now. Revisit at the first external implementation.

---

## D11 — Build order: downgrade renderer before HTML renderer

**2026-09-13**

It proves the degradation contract holds and is far simpler than the HTML renderer. If a construct turns out not to degrade cleanly, that should surface in week one rather than after it has been styled.

Conformance harness and test schema come before any parser code, so everything after has somewhere to report to.

---

## D12 — `::col` is the only grammar addition beyond existing prior art

**2026-09-13**

A two-colon separator directive for sibling regions inside a parent that declares them. Only `columns` uses it in v0.

The alternative — nested full `:::col` fences inside a longer outer fence — requires no new grammar but produces four levels of colons to express two columns. Authorability is the entire point of the project, so one grammar addition is worth it. Defined generally rather than as a `columns` special case so future constructs can use it.

---

## D13 — Theme tokens in frontmatter; presets carry the load

**2026-09-13**

Token names are normative; how a renderer maps them to output is implementation-defined. A document with no `theme` block must still render well.

This is the piece nothing in the market standardizes, and the default stylesheet that makes the vocabulary look good with zero configuration is probably the single highest-leverage artifact in the project. Unglamorous, and easy to defer past the point where it should have shipped.

---

## D14 — Writing Markset back: a patching serializer over the mdast, not a concrete syntax tree

**2026-09-28**

Nothing turned a Markset tree back into Markset source, and the TipTap editor (`docs/briefs/tiptap.md`) needs that before anything else, under one requirement: editing must not damage the file. An unedited document comes back byte for byte, and an edit touches only its own lines, because the output is committed to Git and reviewed as a diff.

`serializeDocument(tree, { original })` in `packages/parser` does it in two modes.

- **Without an original** it writes the canonical form: the §3 serialization choices (`-` bullets, `*` emphasis, fenced code), defaults left unwritten, outer fences one colon longer than anything inside them, and a blank line after a fence where §3 needs one.
- **With one** it writes a patch. The edited tree is matched against the original parse by structure — a longest common subsequence over each list of children, then same-type pairing between the anchors — and every node that is still there unchanged is copied from its source slice, with the prefixes of the containers above it (`> `, a list item's indent) taken off each line so they can be put back. A changed construct keeps its original fence line, `::col` line, callout marker line or tab heading when its own fields are unchanged, and keeps its fence length when that still fits. The text between two blocks that are still adjacent is the original text, so whatever sat there that the tree does not hold, such as an orphaned attribute line, survives. A changed list keeps its marker, changed emphasis its `*` or `_`, a changed code block its fence character, a changed table every row it did not change.

**Nothing in it trusts itself.** The output is parsed again and compared with the tree it was asked to write. A patch that does not reproduce the tree is retried block by block — every untouched top-level block still copied, changed ones written canonically — then written canonically, and a canonical form that does not reproduce the tree is an error. Writing a file that says something other than the tree would be worse than refusing to write it.

Matching at save time means the editor carries nothing: no offsets on its nodes and no source slices in its state. A host gives `serializeDocument` the tree and the text it loaded, and nothing else.

**Rejected:**

- **A lossless or concrete-syntax-tree mode in the parser.** It is a second tree shape to keep in step with the §7 AST, every consumer would have to carry its tokens through edits — which a ProseMirror document does not — and it still needs a canonical writer for everything the author adds. The mdast already carries positions, which is all a patch needs.
- **Reusing only unchanged top-level blocks**, the brief's first suggestion. It is kept, as the middle fallback, but not as the primary: a card is one top-level block, and editing one paragraph in a sixty-line card would rewrite the other fifty-nine.
- **Source slices stored on the editor's nodes.** They go stale under collaborative editing, where the host (not this package) decides whether Yjs is involved, and they put offsets into state a host persists.
- **A round-trip conformance aspect.** The spec does not require an implementation to write source, so a second implementation could not be held to it. The checks run in `packages/parser/test/serialize.test.ts` instead, over every document in `tests/` and every example: byte identity unedited, a canonical form that parses back and is a fixed point, an edit to any text changing only the lines of its block, and one structural edit per construct with the exact lines that differ.

**Known limits,** each confined to the block that changed. A document that already carries warnings may be repaired where it is edited: an unclosed fence gains its close. A changed setext heading is re-underlined to its new length. The lines of a changed blockquote or list item take the canonical prefix (`> `, the marker's width), so an item indented four spaces by its author is indented two once it is edited.
