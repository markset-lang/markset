# Brief: `@markset-lang/tiptap`, WYSIWYG editing of Markset documents

A TipTap (v3) extension set that edits a Markset document visually and saves it back as Markset source. It is
published from this repository like the other packages. Its first consumer is Streamlane (streamlane-app/streamlane),
which will use it to edit Repo docs: product docs kept as markdown in Git and committed back to GitHub. Nothing in
this package may know about Streamlane.

Read `CLAUDE.md` and `spec/v0.md` first. The invariants and working rules there apply unchanged.

## The requirement to meet

Editing must not damage the file.

- **Unchanged means identical.** Parsing a document into the editor and serializing it with no edits gives back the
  same bytes, frontmatter included.
- **An edit touches only its own lines.** Changing one card's text must not reformat the rest of the document. The
  output is committed to Git and reviewed as a diff.
- **Only what Markset can express.** The schema contains CommonMark, GFM tables, the three grammar constructs
  (attribute specifiers, block directives with separators, bracketed spans), attribute lines, and the eight
  constructs. The editor cannot produce a document the parser would reject. Every construct's validity rules (spec
  §4) constrain what the editor allows, and diagnostics show where a pasted or loaded document is invalid.

## Suggested approach (decide it, then record it)

- Build on `parseDocument` and the mdast it produces. Do not write a second parser.
- A missing piece: nothing turns a Markset AST back into Markset source. `render-downgrade` produces plain CommonMark.
  A to-markdown extension for `directive`, `separator` and `span` nodes and attributes belongs in `parser` or
  `remark-markset`, not in the TipTap package, because a formatter or any other editor needs it too. It gets its own
  conformance aspect, or round-trip checks over the existing cases.
- Fidelity: mdast drops formatting choices such as `*` vs `_`, list markers, fence lengths, and spacing. Nodes carry
  source positions, and the site already slices construct source by position. One approach keeps each top-level
  block's original source slice and reuses it for any block the edit left untouched, serializing only the changed
  blocks. Weigh that against a lossless or concrete syntax tree mode in the parser.
- Record the decision as the next `D` entry in `docs/decisions.md`, with what was rejected.

## Package shape

- `packages/tiptap`, published as `@markset-lang/tiptap`, MIT, with the same manifest conventions as its siblings
  (`homepage`, `repository.directory`, `markset-source` export condition, `files`, `publishConfig`).
- API: the extension set; `fromMarkset(source) → ProseMirror JSON` and `toMarkset(doc, original?) → string`;
  frontmatter kept verbatim and exposed as data.
- Node views ship unstyled: `ms-` class names and `data-` attributes, following the HTML renderer's conventions, so
  `markset.css` or a host's own theme styles them. React node views come from an optional entry point
  (`@markset-lang/tiptap/react`). A host can replace any node view through an option (Streamlane will supply Mantine
  ones).
- The host decides collaboration (Yjs or none), extra nodes, and persistence. The package makes no assumption about
  any of them.

## Dependencies: ask first

Per `CLAUDE.md`, propose each one with its license and wait for approval. The likely minimum:

- `@tiptap/core` and `@tiptap/pm` (MIT) as peer dependencies
- `react` as an optional peer, for the `/react` entry only
- a DOM for tests (`happy-dom` or `jsdom`), as a dev dependency

Parsing and serializing can mostly be tested on ProseMirror JSON without a DOM.

## Repository chores a new package brings

- Add it to `build` and `release` in the root `package.json`, in dependency order after the packages it imports. A
  test holds that order.
- The first npm publish is by hand (`npm publish --workspace @markset-lang/tiptap`, with the passkey), then configure
  its trusted publisher on npmjs.com before a CI release. See the Status entry on `ENEEDAUTH`.
- A reference page or a playground mode showing each construct being edited, if it earns its place on the site.
- Update the Status section of `CLAUDE.md` and the layout block.

## Done when

- `npm test` covers byte-identical round trips over `tests/*.json` inputs and `examples/*.md`, plus edit-diff tests:
  one change per construct, asserting that only its lines differ.
- Every construct can be inserted, edited, and removed in the editor, and invalid structure cannot be produced.
- The decision entry is written, and a release carries the package, published by hand the first time.
