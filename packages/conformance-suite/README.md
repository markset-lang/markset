# @markset-lang/conformance-suite

The Markset conformance cases, as data. This package contains no parser, no renderer, and no opinion about how an implementation is built — it is what an implementation is *checked against*.

If you are writing a Markset implementation, in any language, this is the only thing you need from the reference implementation.

## What is in it

| Path | What |
|---|---|
| `cases/*.json` | One file per spec section. Each file is an array of cases. |
| `schema.json` | The normative JSON Schema every case file validates against. |

The JSON is the artifact. Read it off disk in whatever language you are working in:

```
node_modules/@markset-lang/conformance-suite/cases/grid.json
```

For JavaScript there is also a small loader, which is a convenience rather than the format:

```js
import { loadCases, loadSection, sections } from "@markset-lang/conformance-suite";

for (const c of loadCases()) {
  const { ast, diagnostics } = yourParser(c.markset);
  // compare against c.ast, c.valid, c.diagnostics
}
```

## A case

```json
{
  "section": "grid",
  "markset": ":::grid{cols=2}\n- One\n- Two\n:::\n",
  "html": "<div class=\"ms-grid\" data-cols=\"2\">...</div>\n",
  "downgrade": "- One\n- Two\n",
  "ast": { "type": "root", "children": [] },
  "valid": true
}
```

- `markset` is the input: a full document in the construct sections, a bare fragment in the grammar sections.
- `valid` is false when the parser must emit at least one error-severity diagnostic.
- `diagnostics` names every code that must be emitted, errors and warnings alike, in any order. Absent means none are permitted.
- `ast` is required whenever `valid` is true.

## What you must match, and what you need not

This is the part worth reading before you start, because half the suite is not a byte-comparison.

**Normative — match exactly:**

- `valid`
- `diagnostics`, as a *set of codes*. Messages and source offsets are yours to choose.
- `ast`, compared structurally: key order is ignored and `position` fields are removed first.

**Reference output — be equivalent, not identical:**

- `html` and `downgrade` are what the reference implementation emits. A conforming renderer must produce *equivalent* output. HTML is equivalent when both parse to the same DOM after dropping whitespace-only text between block elements, ignoring attribute order, quoting and entity encoding. Downgrade output is equivalent when both parse to the same CommonMark tree with GFM tables and frontmatter enabled, so escaping and table padding may differ.

Byte-identical rendering is required only of the reference implementation, which is why its own harness compares strings and yours should not.

Diagrams are the one place the `html` field deliberately understates what a renderer may do: the cases pin the *undrawn* form, a code block, because a drawn diagram is an implementation's own SVG and could never be a shared expectation. See spec §10.

## Where the rules are

Spec §7 defines the case format and the two tiers above; the sections it refers to define the constructs. The specification is at <https://markset.org/spec/>.

The canonical copy of these cases is `tests/` in the [Markset repository](https://github.com/markset-lang/markset), and a test there fails if this package's copy differs from it.

MIT.
