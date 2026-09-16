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
  diagram-ascii/    ASCII diagram -> SVG (spec §10). A pure function with no dependencies;
                    render-html uses it by default and takes any other engine from its caller.
  conformance/      harness: validates tests/*.json against the schema, runs each section's driver
  cli/
tsconfig.build.json  emit settings for publishing; tsconfig.json stays noEmit and is what the editor reads
site/       static site generator (build.ts) and content; every page is Markset rendered by the packages above.
            Nav lives in NAV and the page list in build(). The examples index generates Markset source and renders it,
            rather than assembling HTML, so that page is a Markset document like every other one.
            content/start.md is the adoption page, content/github-pages.md is the publishing recipe
            (tested by site/test/recipe.test.ts, which runs it),
            content/cli.md documents the command line tool, and content/reference/index.md teaches the
            shared grammar. An example with `toggles: true` in EXAMPLES gets every top-level construct
            wrapped in a Result/Markdown tabs pair, with the source sliced from the file by node
            position, so the panes cannot drift and the toggle needs no script.
docs/       background analysis, prior art, design rationale
            future-requirements.md — open register of things real documents asked for; the
            open counterpart to spec §8, which is the closed list of deferred constructs
```

## Toolchain

- Node ≥ 22.18, npm workspaces. Source is TypeScript run directly by Node's type stripping, so use erasable syntax only (no enums, namespaces, or parameter properties) and import with explicit `.ts` extensions.
- The CommonMark base is **micromark + mdast** (`micromark`, `mdast-util-from-markdown`, the GFM table pair, and the `micromark-util-*` helpers), chosen 2026-09-13. Markset's three grammar constructs are a micromark syntax extension in `packages/parser/src/syntax.ts` and an mdast compiler extension in `from-markdown.ts`. The Markset AST is mdast plus `directive`, `separator`, and `span` nodes (`ast.ts`), so any unified tooling can consume it. Tokenizers find boundaries only; fence lines and attribute specifiers are parsed by the line grammar, so there is one grammar to keep in sync with the spec.
- `npm install` once, to link the workspace packages. Then `npm test` (unit tests plus the full conformance suite) and `npm run conformance` for the per-section report (`--section <name>`, `--verbose`).
- `npm run typecheck` runs `tsc --noEmit`. `typescript`, `@types/node` (approved 2026-09-14), `@biomejs/biome` (approved 2026-09-15) and `@mermaid-js/mermaid-cli` (approved 2026-09-15) are the dev dependencies. **There is a build step now, but only for publishing:** `npm run build` compiles each publishable package to `dist/` (JS, `.d.ts`, and both map kinds) with `tsconfig.build.json`. Nothing in the development workflow uses it — node still runs the `.ts` sources directly. mermaid-cli is the heavy one — it pulls puppeteer and a Chromium download — and it is used by nothing but `site/mermaid.ts`, which draws the site's mermaid fences. Nothing in `packages/` depends on it, and a consumer of the library never installs it.
- `npm run lint` checks formatting and lint rules, `npm run format` applies them, and CI runs the check as a gate. Configuration is `biome.jsonc`, deliberately not `biome.json`: a `//` comment in a `biome.json` silently drops the members that follow it in that object, so the config reads as applied and is not. `test/tooling.test.ts` asserts every setting survives parsing. Two exemptions, both with reasons in the config: stylesheets keep their one-rule-per-line style, and `tests/*.json` is generated by `JSON.stringify` and would fight the formatter on every regeneration.
- The default stylesheet holds one palette: each color is a `light-dark(light, dark)` pair and `color-scheme` decides which half applies, so there is no second block to keep in sync and forcing a scheme is one property. Nothing in a document chooses it; that is the reader's, through `data-scheme` on `<body>` (§6).
- The stylesheet is checked at a 390px viewport, not just on a desktop window. Headless Chrome clamps its window to 500px, so measure inside an iframe of the target width and read `document.documentElement.scrollWidth`; anything above the viewport width means a block is pushing the page sideways.
- `site/site.css` is the site's own theme, layered over `markset.css` the way a theme stylesheet is layered over a document (§6). It carries the display typeface and the author classes the site's pages use: `.tick` for a ruler divider, `.stats` for a metrics fact strip, `.compare` for a comparison table, alongside the reserved classes from §5.
- `build(outDir)` takes an output directory; the tests build into a temporary one so the suite never races `dist/` against a running `site:watch` or a browser.
- The repository and site URLs live in `package.json` (`repository`, `homepage`) and are read by `site/build.ts`; a test asserts no page or README links anywhere else. Change them there, not in prose.
- The site draws `ascii` fences by taking the renderer's default rather than configuring anything, so what a reader
  sees is what any consumer gets. No other language is registered: a `mermaid` fence on this site renders as a code
  block, which is §10 obligation 1 working. The conformance harness passes `diagrams: false`, because the `html`
  aspect has to be a form a second implementation could also produce.
- `npm run site` builds the documentation site into `dist/` (ignored by git). Each build stages into its own `dist.staging-<tag>/` and renames into place, so a reader never sees a half-built tree, a failed build leaves the previous one intact, and two builds at once (`npm run site` while `site:watch` rebuilds) cannot delete each other's work. `npm run site:watch` serves it at http://localhost:3000 (`-- --port N` to change), rebuilds on change, and reloads open browsers; a stylesheet edit swaps the `<link>` instead of reloading, so the scroll position survives. The reload client is injected as pages are served, never written to `dist/`. The reference and conformance pages are generated from `tests/*.json`, so they never drift from the suite. `.github/workflows/pages.yml` deploys `dist/` to GitHub Pages on push to `main`; Pages must be enabled once in the repository settings with "GitHub Actions" as the source.
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
- [x] CLI (`packages/cli`: `check`, `html`, `downgrade`, `ast`, `css`; `examples/showcase.md` exercises every construct)
- [x] Attribute lines (§2.5, djot-style `{.lead}` line before a block; `packages/parser/src/attribute-lines.ts`, `tests/attribute-line.json`)
- [x] §9 open questions closed with decisions (spec §9)
- [x] **v0 declared 2026-09-15, reference implementation `0.1.0`.** Candidates `0.0.0-rc.1` and `0.0.0-rc.2` preceded it, and `0.2.0` is the current release — additive work since, which is all v0 allows. Changes within v0 are additive only; the change policy is spec §0. The version string lives in `package.json` and a test asserts every other copy of it agrees.
- [x] Documentation site (`site/`): home, reference page per construct, spec with TOC, conformance browser, showcase; deployed by `pages.yml`
- [x] Attributes on one list item (§2.5, `- {.hot}` opens the item) so a single grid item or step can be styled; theme stylesheet hook (`markset html --theme <file>`, `renderPage({ theme })`, §6)
- [x] Default stylesheet layout: two lanes with one left edge (prose at `--ms-measure`, constructs and tables at `--ms-measure-wide`); chosen by screenshot 2026-09-14 after a centered two-lane version was rejected
- [x] First real documents written against the candidate. The private original is untracked and stays out of the repository; the published twin is `examples/notification-routing.md` with `examples/dossier.css`, describing an invented system. Writing them forced §2.5 list-item attributes and the theme hook, and nothing in §4.
- [x] Three worked examples under `examples/`, each wired into `EXAMPLES` in `site/build.ts`: the construct tour, an analysis document with `dossier.css`, and a strategy memo with `memo.css`. All three describe invented systems; internal material stays out of the repository.
- [x] Site: per-page theme stylesheets. `EXAMPLES` in `site/build.ts` lists each example document and the theme it is read with; the shell links it after `site.css` so it can override. Adding an example is one entry in that array, and a test requires `examples/*.md` and that array to match exactly, in both directions.
- [x] Heading ids in the renderer (`addHeadingIds` in `packages/render-html`, on by default, §2.1). Set on the heading node, so a caller that also builds a table of contents reads the same ids it renders.
- [x] Reader's choice of color scheme with no script. Every color is one `light-dark()` pair resolved through `color-scheme`; `data-scheme` on `<body>` forces it (§6); the site's control is three radio inputs read by `:has()`.
- [x] Fourth real document, `examples/incident-review.md` with `examples/incident.css`. Forced nothing in §2 or §4, and is the evidence that `steps` already carries a timeline.
- [x] Register entry 7 decided by counting: four documents invented 54 author classes and shared two, neither of which clears the bar. `docs/future-requirements.md` also carries the test a proposed ninth construct has to pass.
- [x] Diagrams (§10, added 2026-09-15). Not a construct: a diagram is a fenced code block whose info string names
      a language, which every renderer already agrees on. §10 settles what a renderer may *do* with one. Drawing is
      on by default for `ascii` only (`--diagram none` turns it off, `<lang>=<command>` adds a language), never
      changes the AST, and only happens inside a captioned `figure` —
      without a text alternative, drawing would remove content for a screen-reader user while adding it for everyone
      else. The drawn form is an `<img>` holding an SVG data URI, so it is inert by shape rather than by trust.
      ASCII is the recommended source: it is the only common one whose §3 fallback is still a diagram.
- [x] Seventh example, `examples/architecture.md` with `examples/tidewater.css`: the diagram-heavy genre, written after §10 to test it. It found three defects no unit test had — a line stopping half a cell short of the box it met, a lone hyphen in a label drawn as a rule, and `.ms-figure` not being `border-box` despite carrying an explicit width, which pushed three figures past a 390px viewport. It invented no author classes.
- [ ] Playground page (needs a bundler such as esbuild, not yet approved)
- [x] Six real documents written against the candidate; the last four forced no change to §2 or §4, which is what v0 was waiting on
- [x] **Publishable, 2026-09-15.** Five packages go to npm — `parser`, `diagram-ascii`, `render-downgrade`,
      `render-html`, `cli` — and `conformance` stays private because nothing consumes it. Sources cannot be shipped
      raw: Node refuses to strip types under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, and no
      flag lifts it), so `dist/` is the only thing that works. `erasableSyntaxOnly` made the emit mechanical, and
      `rewriteRelativeImportExtensions` turns our `./x.ts` specifiers into `./x.js`.
      **The `markset-source` export condition is what keeps the repo runnable:** every published manifest lists it
      first, pointing at `src`, so this repo's scripts (`--conditions=markset-source`, and `customConditions` for
      tsc) resolve to TypeScript while an installed consumer falls through to `dist`. npm ignores
      `publishConfig.exports`, which was the alternative. Verified by packing all five and installing them into a
      clean project: the CLI runs, the library imports, and a TypeScript consumer gets accurate types.
- [x] **Published 2026-09-16, `0.2.0`, under the `@markset-lang` scope.** Not `@markset`: that scope belongs to
      someone else, alongside an unscoped `markset` package from 2019, and npm answers a write to a scope you do not
      belong to with 404 rather than 403 — so the first attempt read as "package not found" and meant "not yours".
      `markset-lang` was already the GitHub org, so the two now agree. The CLI is unaffected either way: `bin` names
      are independent of package names, so `markset` is still the command.
      Publishing needs a TTY. npm's 2FA is a passkey here, and the browser flow it opens has no headless form —
      `npm login --auth-type=web` first, since a token from a plain `npm login` only offers to take a typed code.
      `--provenance` is CI-only and fails locally with `provider: null`.
- [ ] Publish from CI. `.github/workflows/release.yml` runs the whole gate on a `v*` tag and publishes only what is
      not already on the registry, so a re-pushed tag is safe. It still needs credentials: either an `NPM_TOKEN`
      secret, or — better, and what npm is steering everyone to, since tokens that bypass 2FA are being restricted —
      trusted publishing, which is OIDC and needs each package configured once on npmjs.com. Until one of those
      exists, tagging `v0.2.0` runs the gate and publishes nothing, which is correct but is not a release.
