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
  chart-table/      a figure's table -> an SVG chart (spec §11). A pure function with no dependencies,
                    like diagram-ascii, with two differences: it returns a hast tree rather than a string,
                    and it emits no color at all — geometry and data-series, with markset.css supplying
                    every color, so a theme restyles a chart by setting --ms-chart-1.
  conformance/      harness: validates tests/*.json against the schema, runs each section's driver.
                    Private: its drivers import this implementation, so it measures nothing else.
  remark-markset/   remark plugin: the parser's micromark and mdast extensions, the normalization and
                    validation parseDocument runs, and diagnostics as vfile messages. Adds Markset and
                    nothing else - tables and frontmatter stay the caller's choice. It also lowers
                    attributes onto data.hProperties, which render-html does separately for its own
                    non-unified path; a test renders one document both ways and compares, so the two
                    copies cannot drift.
  conformance-suite/ the cases as data - tests/*.json and the schema, copied in at build time by
                    stage.ts and published for implementations that are not this one. No dependencies,
                    deliberately: it is what an implementation is checked against, so it must not carry one.
  cli/
tsconfig.build.json  emit settings for publishing; tsconfig.json stays noEmit and is what the editor reads
site/       static site generator (build.ts) and content; every page is Markset rendered by the packages above.
            Nav lives in NAV and the page list in build(). The examples index generates Markset source and renders it,
            rather than assembling HTML, so that page is a Markset document like every other one.
            content/start.md is the adoption page, content/github-pages.md is the publishing recipe
            (tested by site/test/recipe.test.ts, which runs it),
            content/cli.md documents the command line tool, and content/reference/index.md teaches the
            shared grammar. playground/ is the one page that is an application rather than a document:
            app.ts is bundled by esbuild and runs the parser and both renderers in the reader's browser,
            samples/ holds its starter documents (imported as text, so they are checked like any other
            document), diagnostics.ts is the part testable outside a browser, and vocabulary.ts holds the
            insert palette's shape and its placement rules. The palette itself is generated by
            vocabularyGroups() in build.ts out of BLOCK_DIRECTIVE_NAMES, the reference index's BLURB and
            the canonical cases in tests/, so it cannot drift from the grammar, the reference or the suite. An example with `toggles: true` in EXAMPLES gets every top-level construct
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
- `esbuild` (approved 2026-09-17) bundles `site/playground/app.ts` for the browser, and nothing else uses it.
  It resolves through `markset-source`, so the bundle is built from `src/` and a stale `dist/` cannot reach a
  reader. It is also a guard with no extra cost: five packages go into the bundle and none may import a node
  builtin, so `npm run site` fails outright if one starts to. The suite's browser test drives the built page in
  headless Chrome, using the puppeteer that arrives with mermaid-cli rather than a declared dependency of its own;
  if that ever stops being true the test reports a skip with a reason instead of failing. **It launches with
  `site/puppeteer.json`**, the same flags `site/mermaid.ts` passes to mmdc: the runner image restricts
  unprivileged user namespaces, so without `--no-sandbox` Chrome refuses to start at all and the failure is
  CI-only. That is Chrome's process sandbox and not the iframe `sandbox` attribute the tests assert on, which
  the renderer enforces inside the page and this flag does not touch.
- `npm run lint` checks formatting and lint rules, `npm run format` applies them, and CI runs the check as a gate. Configuration is `biome.jsonc`, deliberately not `biome.json`: a `//` comment in a `biome.json` silently drops the members that follow it in that object, so the config reads as applied and is not. `test/tooling.test.ts` asserts every setting survives parsing. Two exemptions, both with reasons in the config: stylesheets keep their one-rule-per-line style, and `tests/*.json` is generated by `JSON.stringify` and would fight the formatter on every regeneration.
- The default stylesheet holds one palette: each color is a `light-dark(light, dark)` pair and `color-scheme` decides which half applies, so there is no second block to keep in sync and forcing a scheme is one property. Nothing in a document chooses it; that is the reader's, through `data-scheme` on `<body>` (§6).
- The stylesheet is checked at a 390px viewport, not just on a desktop window. Headless Chrome clamps its window to 500px, so measure inside an iframe of the target width and read `document.documentElement.scrollWidth`; anything above the viewport width means a block is pushing the page sideways.
- `site/site.css` is the site's own theme, layered over `markset.css` the way a theme stylesheet is layered over a document (§6). It carries the display typeface and the author classes the site's pages use: `.tick` for a ruler divider, `.stats` for a metrics fact strip, `.compare` for a comparison table, alongside the reserved classes from §5.
- `build(outDir)` takes an output directory; the tests build into a temporary one so the suite never races `dist/` against a running `site:watch` or a browser.
- The repository and site URLs live in `package.json` (`repository`, `homepage`) and are read by `site/build.ts`; a test asserts no page or README links anywhere else, and that all eight published manifests carry the same `homepage`. Change them there, not in prose. `homepage`'s host is also written to `dist/CNAME`, which is what tells Pages the custom domain, so moving the site is one string.
- The site draws `ascii` fences by taking the renderer's default rather than configuring anything, so what a reader
  sees is what any consumer gets. It also draws `mermaid`, through `site/mermaid.ts` rather than through the
  renderer's engine option, because each diagram is rendered twice for light and dark and spliced into one SVG.
  Everything else stays a code block, which is §10 obligation 1 working. The conformance harness passes
  `diagrams: false`, because the `html` aspect has to be a form a second implementation could also produce.
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

**Open.** Everything below this is done; these two are not. Kept at the top because the shipped list is long and
in commit order, which is the wrong order for finding the work.

- [x] **Released 0.3.0 from CI, 2026-09-17, and the OIDC path is proved.** Seven packages: the five from 0.2.0
      plus `remark-markset` and `conformance-suite`. Tagging `v0.3.0` ran the whole gate and published five of them
      over trusted publishing with provenance and no secret anywhere.
      **A package npm has never seen cannot be published by CI**, and this is the trap to remember when adding an
      eighth. Trusted publishing is configured per package on npmjs.com, a package that does not exist cannot have a
      publisher configured, so the run failed with `ENEEDAUTH` on the first new one and never reached the second.
      A new package needs one publish by hand — `npm publish --workspace <name>`, in a terminal, with the passkey —
      and then its trusted publisher configured, after which it releases with the rest. The publish step walks the
      packages in order and stops at the first failure, so the five that were already established went out first;
      that ordering is luck rather than design, and the step is idempotent, so the fix was one command.
      Registry reads lag publication by minutes. The workflow log printing `+ name@version` is the authoritative
      signal; `dist-tags` said 0.2.0 for packages that had just gone out, which has now twice looked like a failure
      and twice been nothing.
- [ ] Nothing. The playground was the last open item; see the entry at the end of the done list.

**Done,** in the order it landed.

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
- [x] **v0 declared 2026-09-15, reference implementation `0.1.0`.** Candidates `0.0.0-rc.1` and `0.0.0-rc.2` preceded it, and `0.3.0` is the current release — additive work since, which is all v0 allows. Changes within v0 are additive only; the change policy is spec §0. The version string lives in `package.json` and a test asserts every other copy of it agrees.
- [x] Documentation site (`site/`): home, reference page per construct, spec with TOC, conformance browser, showcase; deployed by `pages.yml`
- [x] Attributes on one list item (§2.5, `- {.hot}` opens the item) so a single grid item or step can be styled; theme stylesheet hook (`markset html --theme <file>`, `renderPage({ theme })`, §6)
- [x] Default stylesheet layout: two lanes with one left edge (prose at `--ms-measure`, constructs and tables at `--ms-measure-wide`); chosen by screenshot 2026-09-14 after a centered two-lane version was rejected
- [x] First real documents written against the candidate. The private original is untracked and stays out of the repository; the published twin is `examples/notification-routing.md` with `examples/dossier.css`, describing an invented system. Writing them forced §2.5 list-item attributes and the theme hook, and nothing in §4.
- [x] Three worked examples under `examples/`, each wired into `EXAMPLES` in `site/build.ts`: the construct tour, an analysis document with `dossier.css`, and a strategy memo with `memo.css`. All three describe invented systems; internal material stays out of the repository.
- [x] Site: per-page theme stylesheets. `EXAMPLES` in `site/build.ts` lists each example document and the theme it is read with; the shell links it after `site.css` so it can override. Adding an example is one entry in that array, and a test requires `examples/*.md` and that array to match exactly, in both directions.
- [x] Heading ids in the renderer (`addHeadingIds` in `packages/render-html`, on by default, §2.1). Set on the heading node, so a caller that also builds a table of contents reads the same ids it renders.
- [x] Reader's choice of color scheme. Every color is one `light-dark()` pair resolved through `color-scheme`;
      `data-scheme` on `<body>` forces it (§6); the site's control is three radio inputs read by `:has()`.
      The control is CSS; carrying the choice to the next page is the one part that cannot be, so the site
      shell has exactly one script, which restores the saved choice into `data-scheme` before anything paints
      and records each change. It is chrome, never document output: the rule the tests hold is that nothing
      inside `<main>` has a script and no page has a second one. With scripting off the control still works
      for the page it is on.
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
- [x] **Publishing from CI is wired, 2026-09-16.** `.github/workflows/release.yml` runs the whole gate on a `v*`
      tag and publishes only what is not already on the registry, so a re-pushed tag is safe — proved by dispatching
      it against an already-released commit and watching all five skip. Authentication is **trusted publishing**,
      configured once per package on npmjs.com against this repository and `release.yml`: npm exchanges the OIDC
      token GitHub mints for the run, so there is no secret to store, rotate or leak, and provenance comes with it.
      Each package is also set to *require 2FA and disallow bypass-2FA tokens*, which costs nothing here — CI uses
      OIDC and a human uses a passkey — and closes the route npm is restricting anyway.
      **The workflow configures no credential, deliberately.** An `.npmrc` with an empty `_authToken` is worse than
      none: npm tries it, is refused, and never reaches the OIDC path. That is not hypothetical — `setup-node`'s
      `registry-url` broke `npm ci` in this very workflow with a 401 about a password, on a runner that never had one.
- [x] Charts (§11, added 2026-09-16). Not a construct, on §10's grounds: a chart is a `figure` holding a table,
      which independent renderers already agree on, so what was missing was what a renderer may *do* with one. Eight
      obligations — §10's seven, plus one only charts need: a drawn chart MUST NOT make its table unreachable,
      because the picture is a lossy view of data a reader may want exactly, and where the numbers are the argument
      that reader is not an edge case. The source is the table rather than a data-language fence, which is what
      makes the §3 fallback the data itself rather than a gesture at it. §8 no longer defers `chart`.
      One attribute, `chart` on `figure`, present in the AST **only when set**, so every figure and diagram case
      pinned before the change is identical after it — entry 3's lesson about optional fields, first applied.
      `line`, `bar` and `column` are the types, and the set is closed unlike §10's open language set: an unknown diagram language is
      safe because it falls back to what the author wrote, and an unknown chart type is not, because a renderer that
      guesses draws a different argument from the same data. `bar` and `column` are two names rather than one type
      and an orientation, because which axis carries the categories follows from the data and a theme could not make
      the choice anyway — a drawn chart is an image it cannot see inside. Thirteen cases in `tests/chart.json`.
- [x] Chart engine (`packages/chart-table`, 2026-09-16). `line`, `bar` and `column`, drawn by default; `--chart none`
      or `charts: false` turns it off, and the conformance harness passes that because a drawn chart is this
      implementation's own SVG. **Inline `<svg>`, not §10's `<img>` data URI**, and the reason generalizes: §10
      refused inline markup because a diagram engine on the CLI path is an arbitrary command, and raw markup from one
      is a channel documents are denied. This engine is ours and returns constructed nodes, so there is no markup to
      parse and no channel to open — obligation 6 is tested rather than inherited from the shape of an `<img>`.
      What inline buys is a chart a theme can color, which a data URI cannot give at any price.
      The palette is validated, not chosen by eye: eight categorical hues checked for lightness band, chroma floor,
      colorblind separation between neighbours and normal-vision separation, in both schemes, against this
      stylesheet's own surfaces. Three light-mode slots fall below 3:1, which the method allows only where the values
      are also readable as text — obligation 8 is exactly that guarantee. A ninth series folds back to slot 1 rather
      than inventing a hue that was never checked.
      Bars start at zero and lines fit their data: a bar encodes magnitude as length, so a truncated baseline
      misstates the ratio; a line encodes it as position, and forcing zero flattens the shape the chart exists to
      show. Found by looking at the rendered page — the projection figure in `capacity-review.md` is the document
      that asked for charts, and with a zero baseline its crossover was still invisible.
- [x] **Playground, 2026-09-17** (`site/playground/`, sixth item in the bar). The reference implementation
      bundled for the browser: 203 KB minified, 64 KB over the wire, five packages and no node builtin among them.
      Panes for the rendered page, the HTML, the downgrade, the AST and the diagnostics, which is the same set
      the CLI can hand you from a file.
      **The preview is a sandboxed iframe with scripting switched off, and renders completely anyway** — invariant
      4 as a property of the page rather than a claim about it. A test asserts the `sandbox` attribute is empty,
      which is its most restrictive value, and that the rendered document contains no `<script`.
      The site's rule was "one script per page, none inside `<main>`". The half worth keeping is the second, and
      it still holds here: the module loads at the end of `<body>`, so a rendered Markset document still carries
      no script. The playground is named in the test rather than matched by a pattern, so a second application
      page is a decision somebody makes rather than one that arrives by accident.
      Two copies of line-and-column arithmetic now exist, because the CLI's reads files and the browser's cannot;
      a test runs both over the same document at every seventh offset, since a line number that is right in the
      terminal and wrong in the browser sends a reader to the wrong line of their own file.
      Sharing puts the document in the URL fragment — never sent to a server — base64url so chat clients do not
      clip the link. Adding the sixth bar item costs the phone bar its no-scroll fit, and that was measured
      rather than argued: at 390px the five links came to exactly the 358px available and every candidate label
      overflowed, so the choice was only ever between labels.
- [x] **Insert palette and Vocabulary tab, 2026-09-17.** The playground's answer to "what am I allowed to
      write". Thirteen entries: the eight constructs, diagram and chart, and the three grammar pieces.
      **None of it is a list somebody maintains.** The names are `BLOCK_DIRECTIVE_NAMES`, the descriptions are
      the reference index's own `BLURB`, and every snippet is a case out of `tests/` — the one named
      `canonical` unless it points at a file, in which case the first self-contained case in the section is
      taken instead. That rule is derived, not special-cased: figure's canonical case is an image, and a
      palette that inserted it would render a broken image in the preview.
      The snippets are rendered into the page rather than bundled into the script, so there is one copy and
      the buttons read the text the reader is looking at.
      **Placement comes from the tree, not from line arithmetic**, and that was learned the hard way. Line
      counting cannot tell "the caret is on a card's fence line" from "the caret is in a paragraph", so it
      inserted between fences and broke the document several lines from where the reader clicked. A block now
      goes in at the end of the top-level node the caret is in; an inline span goes in only where the deepest
      node containing the caret is a `text` node. An exclusion list was written first and the property test
      found two cases it missed within the hour — a caret in `markset: 0` giving `markset: [Beta]{.badge}0`,
      and one on a `:::card` fence giving `:::[Beta]{.badge}card`. Asking the tree covers what nobody listed.
      The test that found them is the one worth keeping: every entry inserted at every offset of a document
      with frontmatter, a paragraph and a construct, each result required to parse clean.
