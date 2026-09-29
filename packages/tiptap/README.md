# @markset-lang/tiptap

[TipTap](https://tiptap.dev) extensions that edit a [Markset](https://markset.org/) document visually and save it back as Markset source.

The requirement it is built to meet is that editing must not damage the file:

- **Unchanged means identical.** Load a document, save it without editing, and you get the same bytes back, frontmatter included.
- **An edit touches only its own lines.** Typing into one card changes that card's line. The rest of the document keeps its `_` or `*`, its list markers, its fence lengths and its blank lines, so the output reads as a small diff in review.
- **Only what Markset can express.** The schema holds CommonMark, GFM tables, spans, attribute lines and the eight constructs, and nothing else. An edit that would produce a document the parser rejects is refused or corrected.

```sh
npm i @markset-lang/tiptap @tiptap/core @tiptap/pm
```

## Loading and saving

```js
import { Editor } from "@tiptap/core";
import { Markset, fromMarkset, toMarkset } from "@markset-lang/tiptap";

const loaded = fromMarkset(source);
const editor = new Editor({ extensions: [Markset], content: loaded.doc });

// later
const saved = toMarkset(editor.getJSON(), source);
```

`toMarkset` takes the source the document was loaded from. Everything the editor did not change is copied from it, which is where the guarantees above come from. Without it you get the canonical form: valid, but formatted the reference implementation's way.

`fromMarkset` also returns `frontmatter`, the parsed §6 block, and `diagnostics`. The frontmatter's raw text is kept on the document's first node and written back as it was.

Pass the document to the editor's constructor, as above, rather than loading it later with `setContent`: content set after the editor exists is an edit like any other, and a reader's first undo takes it away.

`Markset` replaces TipTap's StarterKit. Its CommonMark nodes use StarterKit's names (`paragraph`, `bulletList`, `bold`, `italic`, `code`, `link`), so toolbar commands such as `toggleBold` keep working, but the two cannot be installed together.

## Keys

The kit brings the keys StarterKit would have: <kbd>Mod</kbd>+<kbd>B</kbd>, <kbd>I</kbd> and <kbd>E</kbd> for bold, italic and code; <kbd>Enter</kbd> in a list item makes a new item, and <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> nest and un-nest it; <kbd>Shift</kbd>+<kbd>Enter</kbd> is a hard line break; <kbd>Enter</kbd> in a construct's title moves into its body, because a title is one line. Undo and redo are included; pass `Markset.configure({ undoRedo: false })` when the host brings its own history, as a Yjs editor does.

## Commands

```js
editor.commands.insertConstruct("card");                    // any of the eight
editor.commands.setConstructAttributes({ tone: "warn" });   // the construct around the selection
editor.commands.removeConstruct();
editor.commands.setBlockAttributes({ id: null, classes: ["lead"], attrs: {} }); // an attribute line
editor.commands.setSpan({ classes: ["badge"] });            // [text]{.badge}
```

A value the spec does not allow — `tone=purple`, `cols=7`, a class that is not an identifier — is refused, and the command returns `false`.

## Diagnostics

A document that was already invalid when it was loaded, or was pasted in, still opens: nothing is dropped. Its diagnostics carry the path of the block they are about, and the kit draws them as decorations with the class `ms-diagnostic` and a `data-severity`.

```js
import { refreshDiagnostics } from "@markset-lang/tiptap";

refreshDiagnostics(editor, source); // parse what the editor holds now and mark it
```

## Styling and node views

Nodes render with the HTML renderer's conventions: `ms-` classes and `data-` attributes, so `markset.css` or your own theme styles the editor. Load `@markset-lang/tiptap/css/editor.css` after it: four constructs have a different shape while they are edited — a grid and steps hold their list, metrics its table, and every tab panel is shown at once — and that stylesheet gives them the rendered page's look.

Any node's rendering can be replaced:

```js
Markset.configure({ nodeViews: { card: MyCardView } });
```

React views come from their own entry point, so a host without React never loads it:

```js
import { reactNodeViews } from "@markset-lang/tiptap/react";

Markset.configure({ nodeViews: reactNodeViews({ card: MyCard }) });
```

`reactNodeViews()` gives each construct a plain view that draws its default element; pass a component to replace one and keep the rest.

## What the host decides

Collaboration (Yjs or none), extra nodes, persistence and where the file goes are the host's. Nothing in this package assumes any of them. The editor carries no source offsets in its state, so a collaborative document needs nothing extra to be saved correctly: the host keeps the text it loaded and passes it to `toMarkset`.
