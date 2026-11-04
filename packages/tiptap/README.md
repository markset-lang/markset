# @markset-lang/tiptap

[TipTap](https://tiptap.dev) extensions that edit a [Markset](https://markset.org/) document visually and save it back as Markset source.

The requirement it is built to meet is that editing must not damage the file:

- **Unchanged means identical.** Load a document, save it without editing, and you get the same bytes back, frontmatter included.
- **An edit touches only its own lines.** Typing into one card changes that card's line. The rest of the document keeps its `_` or `*`, its list markers, its fence lengths and its blank lines, so the output reads as a small diff in review.
- **Only what Markset can express.** The schema holds CommonMark, GFM tables, spans, attribute lines and the eight constructs, and nothing else. An edit that would produce a document the parser rejects is refused or corrected.

```sh
npm i @markset-lang/tiptap @tiptap/core @tiptap/pm
# or
pnpm add @markset-lang/tiptap @tiptap/core @tiptap/pm
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

## Beside StarterKit: `MarksetConstructs`

A host with its own schema (StarterKit, TableKit, task lists, an image node, collaboration) adds the constructs alone:

```js
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Collaboration from "@tiptap/extension-collaboration";
import { MarksetConstructs } from "@markset-lang/tiptap";
import { mdastToJSON, jsonToMdast } from "@markset-lang/tiptap/convert";

// How this schema differs from the kit's (see "A host with its own schema" below).
const host = { names: { tableHeader: "tableHeader", image: "inlineImage" }, cellContent: "paragraph", node, mark };

const editor = new Editor({
  extensions: [
    StarterKit.configure({ undoRedo: false }),
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockImage, // the host's own `image` node
    MarksetConstructs.configure({
      titleContent: "inline*",
      imageNode: "image",
      host,
      // Changes y-tiptap applies from the shared document were normalized where they were made.
      skipNormalize: (tr) => tr.getMeta("y-sync$")?.isChangeOrigin === true,
    }),
    Collaboration.configure({ document }),
  ],
});
```

It holds the construct nodes, the `directive`, `directiveArgument` and `separator` nodes an unknown or invalid construct is kept in, the commands `insertConstruct`, `setConstructAttributes` and `removeConstruct`, guards that check construct nodes only, and one key: <kbd>Enter</kbd> in a title moves into the construct's body. Everything else is the host's: its nodes, marks, keys, history.

| Option | Default | What it is |
|---|---|---|
| `titleContent` | `"titleInline*"` | What a title, label or caption holds. The kit's group is not in a host's schema; pass `"inline*"`. A hard break in a title is written as a space, because a title is one line. |
| `listContent` | `"list"` | What a grid holds: one list. StarterKit's lists and the task list are all in the `list` group. |
| `tableNode` | `"table"` | The host's table, which metrics hold and a figure may. |
| `imageNode` | `"figureImage"` | The node a figure shows its image with. Name a host's block image, such as `"image"`, and no `figureImage` node is added. |
| `figureContent` | from the two above | A figure's content: by default a caption and one of `imageNode`, `tableNode` or `codeBlock`. |
| `nodeViews` | `{}` | Node views by node name, as for the kit. |
| `skipNormalize` | none | A transaction the guards leave alone: neither refused nor normalized. Under Yjs, pass the changes that arrived from another editor, as above: each was normalized by the editor that made it, and normalizing it again on every collaborator applies the same fix once per editor. |
| `host` | `{}` | The conversion settings the host reads and writes with: `insertConstruct` reads each template through them, so a metrics table arrives with TableKit's header cells and paragraph cells. |

Load with `mdastToJSON(ast, host)` and save with `jsonToMdast(doc, host, { original: ast })` and `serializeDocument`, as below. What a host's schema has no node or mark for, such as frontmatter, spans and the attribute lines of its own blocks, is its hooks' to keep or drop; the guards do not look at it. StarterKit's list item must open with a paragraph, so a grid item that opens with a heading is content that schema does not allow: ProseMirror keeps it as loaded, and it saves, but a host that wants to edit such items gives its list item `block+` content.

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

## Converting without an editor

`@markset-lang/tiptap/convert` is the conversion alone: no TipTap and no DOM, so a server, a worker or a script can read and write the editor's JSON.

```js
import { parseDocument, serializeDocument } from "@markset-lang/parser";
import { mdastToJSON, jsonToMdast, constructTemplate } from "@markset-lang/tiptap/convert";

const { ast } = parseDocument(source);
const doc = mdastToJSON(ast, host);
// later
const tree = jsonToMdast(doc, host, { original: ast });
const saved = serializeDocument(tree, { original: { source, ast } });
```

`mdastToJSON(root, host?)` reads mdast, as `parseDocument` or `remark-markset` makes it, into ProseMirror JSON. `jsonToMdast(doc, host?, { original? })` writes it back; given the tree the document was read from, a block the editor did not change gets its original mdast back, which is what keeps `***a***` nested the way its author wrote it. Without a host the two are exactly what `fromMarkset` and `toMarkset` are made of. `constructTemplate(name)` is a construct's starting mdast, the node `insertConstruct` inserts.

### A host with its own schema

`host` says how a schema differs from the kit's:

```js
const host = {
  // TableKit's first row is tableHeader cells; Markset's inline image is renamed so `image` is the host's block image.
  names: { tableHeader: "tableHeader", image: "inlineImage" },
  // TableKit's cells hold paragraphs (`block+`), not inline content.
  cellContent: "paragraph",
  node: {
    toJSON: (node, context) => undefined, // mdast -> the host's JSON
    toMdast: (node, context) => undefined, // the host's JSON -> mdast
  },
  mark: {
    toJSON: (node, context) => (node.type === "delete" ? { type: "strike" } : undefined),
    toMdast: (mark) => (mark.type === "strike" ? { type: "delete", children: [] } : undefined),
  },
};
```

Every hook is asked first, for every node or mark, and its answer stands: `undefined` leaves the node to Markset, `null` drops it (for a mark, keeps the text and drops the mark), and anything else replaces it. `context` converts children back through the same hooks: `context.blocks(...)` and `context.inline(...)`, and when reading, `context.name(...)` gives the host's name for one of Markset's nodes. A hook sees nodes and marks in the host's own names. A host's own mark nests inside Markset's, just outside `code`. A table cell given more than one paragraph is written as one line, its paragraphs joined by a space, because a GFM cell is one line.

## What the host decides

Collaboration (Yjs or none), extra nodes, persistence and where the file goes are the host's. Nothing in this package assumes any of them. The editor carries no source offsets in its state, so a collaborative document needs nothing extra to be saved correctly: the host keeps the text it loaded and passes it to `toMarkset`.
