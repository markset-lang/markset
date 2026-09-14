# Markset

Markset extends Markdown with a small, closed vocabulary of layout constructs — cards, grids, columns, tabs, steps, metrics, figures, callouts — plus a theme token model. It is a strict superset of CommonMark: every valid CommonMark document is a valid Markset document with identical output.

The problem it solves: Markdown has no attribute mechanism and no generic container, so rich documents require raw HTML, which breaks portability, validation, and non-HTML output targets. Existing answers (Pandoc, Quarto, MyST, MDX, Markdoc) mostly solved the *syntax*; none produced a portable component vocabulary that multiple renderers agree on. That vocabulary is what this project is.

**`spec/v0.md` is the source of truth.** Read it before implementing anything. When code and spec disagree, the spec wins — or the spec changes first, in the same commit.

## Design invariants

These are non-negotiable. If a proposed feature conflicts with one, the feature loses.

1. **Semantic, never presentational.** Authors name intent (`card`, `metrics`); appearance comes from the theme. No inline CSS, no color values, no pixel dimensions in document source. The one exception is `columns` ratio, which is per-instance data.
2. **Every construct degrades.** Each has a defined CommonMark downgrade output and a readable raw-source fallback. Both are normative and both are covered by conformance tests.
3. **Closed vocabulary.** Unknown directive names are validation errors, not silent passthrough. Do not add constructs. The deferred list and its reasoning is spec §8 — treat it as settled.
4. **No code execution.** Nothing evaluates anything. Interactivity is permanently out of scope for the core spec.
5. **Reuse convergent syntax.** Attribute specifiers `{#id .class key=val}`, fenced directives `:::name`, and bracketed spans `[text]{.class}` already exist in Pandoc, djot, MyST, and remark-directive. Do not invent new spellings. Callouts use GitHub's `> [!NOTE]` syntax unchanged.

## Working rules

- **Spec, tests, and implementation change in the same commit.** A construct's grammar, its conformance cases, and its parser branch are one thought.
- **No construct ships without conformance cases.** Minimum per construct: canonical, nested, empty-content, wrong-content-type (`valid: false`), unclosed-fence.
- **Build the downgrade renderer before the HTML renderer.** It proves the degradation contract holds and it's far simpler. If a construct doesn't degrade cleanly, that needs to surface early.
- **Validation errors are specified behavior**, not an afterthought. A closed vocabulary is only worth having if the diagnostics are part of the suite.
- Don't add dependencies without asking.

## Conventions

- HTML output uses the `ms-` class prefix throughout: `ms-card`, `ms-grid-item`, `ms-callout-title`.
- Semantic variants go in `data-` attributes (`data-tone`, `data-cols`, `data-direction`), not class name suffixes.
- Conformance tests are JSON, one file per spec section, mirroring the CommonMark spec test layout. Schema is in spec §7.
- Documents activate Markset via `markset: 0` in frontmatter. The file extension is `.md` — deliberately, so files stay editable and renderable everywhere.

## Layout

```
spec/       v0.md — the specification
            conformance.schema.json — normative schema for tests/*.json (spec §7)
tests/      conformance JSON, one file per section
packages/
  parser/           CommonMark base + Markset extensions -> AST
  render-downgrade/ AST -> plain CommonMark
  render-html/      AST -> HTML
  conformance/      harness: validates tests/*.json against the schema, runs each section's driver
  cli/
docs/       background analysis, prior art, design rationale
```

## Toolchain

- Node ≥ 22.18, npm workspaces. Source is TypeScript run directly by Node's type stripping, so use erasable syntax only (no enums, namespaces, or parameter properties) and import with explicit `.ts` extensions.
- The CommonMark base is **micromark + mdast** (`micromark`, `mdast-util-from-markdown`, the GFM table pair, and the `micromark-util-*` helpers), chosen 2026-09-13. Markset's three grammar constructs are a micromark syntax extension in `packages/parser/src/syntax.ts` and an mdast compiler extension in `from-markdown.ts`. The Markset AST is mdast plus `directive`, `separator`, and `span` nodes (`ast.ts`), so any unified tooling can consume it. Tokenizers find boundaries only; fence lines and attribute specifiers are parsed by the line grammar, so there is one grammar to keep in sync with the spec.
- `npm install` once, to link the workspace packages. Then `npm test` (unit tests plus the full conformance suite) and `npm run conformance` for the per-section report (`--section <name>`, `--verbose`).
- `npm run typecheck` runs `tsc --noEmit`. `typescript` and `@types/node` are the only dev dependencies (approved 2026-09-14); there is still no build step.
- Adding a section to `tests/` without a driver in `packages/conformance/src/drivers.ts` is fine: the harness reports it as skipped, not failed. Same for `html`/`downgrade` fields before those renderers exist. Register a driver once the code exists so the cases start counting.

## Prior art worth knowing

Read these before proposing syntax changes — most ideas have been tried.

- **djot** (jgm) — cleanest CommonMark successor; attributes and divs are native, not extensions.
- **Pandoc** — fenced divs, bracketed spans, attributes everywhere, many output targets. No component vocabulary.
- **Quarto** — closest existing thing to Markset's goal; `::: {.grid}` layout, callouts, cross-refs, HTML/PDF/Typst output.
- **MyST** — directives and roles, published AST spec on mdast/unist, conformance suite. Good model for our spec structure.
- **Markdoc** (Stripe) — schema-validated typed tags, content/code separation. The validation model we're borrowing.
- **MDX** — the thing we are deliberately not becoming.

## Status

<!-- Keep current. This is the first thing to read after the invariants. -->

- [x] Conformance schema (`spec/conformance.schema.json`) and harness (`packages/conformance`)
- [x] Grammar: attribute specifier (§2.1, `packages/parser/src/attributes.ts`, 56 cases)
- [x] Grammar: block directive and separator fence lines (§2.3, §2.4, `packages/parser/src/directives.ts`)
- [x] Grammar: bracketed span (§2.2, `syntax.ts` + `from-markdown.ts`, `tests/bracketed-span.json`)
- [x] Parser: CommonMark base on micromark/mdast with directive containers, separators, spans, GFM tables; `parseDocument()` in `document.ts`. Generic `directive` nodes only; no construct normalization yet.
- [x] Frontmatter and theme tokens (§6, `packages/parser/src/frontmatter.ts`, YAML subset reader in `yaml-subset.ts`, `tests/frontmatter.json`). The parser always parses Markset; `markset: 0` is declared, not required (§9.3 still open).
- [x] Downgrade renderer (`packages/render-downgrade`, mdast-util-to-markdown; `downgrade` aspect pinned on 98 cases)
- [x] Constructs: callout, card, grid, columns, tabs, steps, metrics, figure (`packages/parser/src/constructs.ts`, one `tests/<name>.json` each; AST aspect only until the renderers exist)
- [x] HTML renderer (`packages/render-html`, mdast-util-to-hast + hast-util-to-html; `renderHtml` fragment and `renderPage` full page with theme tokens on `<body>`; `html` aspect pinned on 59 cases)
- [x] Default stylesheet (`packages/render-html/css/markset.css`: tokens, presets, density, radius, dark mode, print; tabs via radio inputs; grid and columns via CSS grid)
- [x] CLI (`packages/cli`: `check`, `html`, `downgrade`, `ast`; `examples/showcase.md` exercises every construct)
- [ ] Block attributes for paragraphs (`.lead`, `.eyebrow` in §5 need a syntax; see §9.5)
- [ ] Publish: keep `@markset/*` private until the suite is frozen; add a `dist/` build (JS + declarations) when publishing becomes a goal
