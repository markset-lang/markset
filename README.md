# Markset

Markset extends Markdown with a small, closed vocabulary of layout constructs and a theme token model. It is a strict superset of CommonMark: every valid CommonMark document is a valid Markset document with identical output, and every Markset construct degrades to plain CommonMark by rule.

```markdown
:::grid{cols=3}
- **Fast** — sub-50 ms cold start
- **Small** — 4 kB gzipped
- **Typed** — no `any` in the public API
:::

> [!WARNING] Breaking change in v3
> The `render()` signature changed.
```

The specification is [`spec/v0.md`](spec/v0.md). The eight constructs are callout, card, grid, columns, tabs, steps, metrics, and figure, plus bracketed spans for inline attributes and frontmatter theme tokens.

## Running

Node 22.18 or later. No build step: sources are TypeScript run directly by Node.

```sh
npm install
node packages/cli/src/markset.ts check examples/showcase.md
node packages/cli/src/markset.ts html examples/showcase.md -o showcase.html
node packages/cli/src/markset.ts downgrade examples/showcase.md
npm test                # unit tests plus the conformance suite
npm run conformance     # per-section conformance report
```

## Layout

| Path | What |
|---|---|
| `spec/v0.md` | The specification. Source of truth. |
| `spec/conformance.schema.json` | Schema for the conformance case files. |
| `tests/*.json` | Conformance cases, one file per spec section. |
| `packages/parser` | micromark/mdast based parser: grammar, constructs, frontmatter, diagnostics. |
| `packages/render-downgrade` | Markset AST to plain CommonMark. |
| `packages/render-html` | Markset AST to HTML, plus the default stylesheet. |
| `packages/conformance` | Harness that runs `tests/*.json` against the packages above. |
| `packages/cli` | `markset check | html | downgrade | ast`. |
| `docs/` | Background analysis and design rationale. |

## Status

Draft. The v0 spec is implemented end to end (parser, both renderers, stylesheet, CLI) and the conformance suite passes, but nothing is frozen. See the status list in `CLAUDE.md` and the open questions in spec §9.
