---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Library

# Editing Markset visually

{.lead}
`@markset-lang/tiptap` puts a Markset document in a [TipTap](https://tiptap.dev) editor: cards, grids and tabs as blocks you click into rather than fence lines you type. Saving writes Markset source back, and changes only the lines you edited.

[On npm]{.badge .success} [TipTap 3]{.badge} [React optional]{.badge}

{.tick}
***

{.eyebrow}
Try it

## Edit it here

This is the editor, running in your browser. Change anything on the left, or insert a construct from the toolbar. The right is the Markset file it saves, and the highlighted lines are the only ones your edits have changed. Everything else is exactly what its author wrote, down to the `*` bullets and the padding in the table.

{{demo}}

{.tick}
***

{.eyebrow}
The promise

## Editing must not damage the file

A Markset document usually lives in a repository, and whatever an editor saves is reviewed as a diff. A visual editor that reformats the file on every save makes that review useless, so the package is built around three guarantees:

:::grid{cols=3}
- ### Unchanged means identical

  Open a document and save it without editing, and you get the same bytes back, frontmatter included. The test suite checks this for every document in the conformance suite and every example on this site.

- ### An edit touches its own lines

  Retype one list item and that line changes. The rest keeps its `_` or `*`, its list markers, its fence lengths and its blank lines.

- ### Only what Markset can say

  The editor's schema holds exactly the vocabulary, and a grid holds exactly one list. An edit that would produce a document the parser rejects is refused or corrected.
:::

{.tick}
***

{.eyebrow}
Getting it

## Installing it

```sh
npm i @markset-lang/tiptap @tiptap/core @tiptap/pm
```

Load a document into the editor, and save it against the source it came from:

```js
import { Editor } from "@tiptap/core";
import { Markset, fromMarkset, toMarkset } from "@markset-lang/tiptap";

const loaded = fromMarkset(source);
const editor = new Editor({ extensions: [Markset], content: loaded.doc });

// later, to save
const saved = toMarkset(editor.getJSON(), source);
```

Passing the original `source` to `toMarkset` is what makes the diffs small: everything the editor did not change is copied from it. Without it, you get valid Markset in the reference implementation's formatting.

`Markset` replaces TipTap's StarterKit rather than joining it. Its CommonMark nodes keep StarterKit's names, so toolbar commands such as `toggleBold` still work.

{.tick}
***

{.eyebrow}
Using it

## Commands

```js
editor.commands.insertConstruct("card");                    // any of the eight
editor.commands.setConstructAttributes({ tone: "warn" });   // the construct around the cursor
editor.commands.removeConstruct();
editor.commands.setBlockAttributes({ id: null, classes: ["lead"], attrs: {} });
editor.commands.setSpan({ classes: ["badge"] });            // [text]{.badge}
```

A value the specification does not allow, such as `tone=purple`, `cols=7` or a class that is not an identifier, is refused, and the command returns `false`. Some rules are corrected rather than refused: remove a column and a ratio that no longer matches is dropped, and a heading typed at a tab's own level moves one level down, so it cannot quietly become a new tab.

## Documents that were already wrong

A document that fails validation still opens, and nothing in it is dropped. `fromMarkset` returns the parser's diagnostics with the block each one belongs to, and the editor marks those blocks:

```js
import { refreshDiagnostics } from "@markset-lang/tiptap";

refreshDiagnostics(editor, source);   // check what the editor holds now, and mark it
```

A marked block has the class `ms-diagnostic` and a `data-severity` of `error` or `warning`, and its title carries the code, such as `GRID_CONTENT`, which the [specification](../spec/index.html) defines.

## Styling it, and replacing the views

Blocks render the way the HTML renderer draws them, with `ms-` classes and `data-` attributes, so the [default stylesheet](../reference/index.html) or your own theme styles the editor too. The one deliberate difference is that every tab panel is shown while editing.

Any node's view can be replaced, and React views have an entry point of their own, so an editor without React never loads it:

```js
import { reactNodeViews } from "@markset-lang/tiptap/react";

Markset.configure({ nodeViews: reactNodeViews({ card: MyCard }) });
```

`reactNodeViews()` gives every construct a plain default view. Pass your own component for any construct and the rest keep theirs.

## What stays yours

Collaboration, with Yjs or without it, extra nodes, persistence and where the file is saved are all up to the application hosting the editor. The editor keeps no source positions in its document, so a collaborative session needs nothing extra to save correctly: keep the text you loaded and pass it to `toMarkset`.
