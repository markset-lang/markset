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
