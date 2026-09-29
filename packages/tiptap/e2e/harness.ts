/**
 * The page the browser tests drive: the kit in an editor, and a handle on
 * window for loading and saving. Everything a test does to the document goes
 * through the browser's own input -- the keyboard, the selection, paste --
 * except loading and saving, which are what the handle is for.
 */
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { type ConstructName, Markset, fromMarkset, toMarkset, type JSONNode } from "../src/index.ts";

let original = "";
let editor = create("");

/** A document is loaded by making the editor with it, as a host does, so a first undo cannot take it away. */
function create(source: string): Editor {
  const element = document.getElementById("editor")!;
  element.replaceChildren();
  return new Editor({ element, extensions: [Markset], content: fromMarkset(source).doc as never });
}

const harness = {
  load(source: string): void {
    original = source;
    editor.destroy();
    editor = create(source);
  },
  /**
   * Whether ProseMirror has caught up with the browser's selection. The browser
   * reports a moved caret on its own schedule, and a command run before then
   * acts on the old selection, which no reader clicking a toolbar could do.
   */
  selectionSettled(): boolean {
    const dom = getSelection();
    if (!dom?.anchorNode || !editor.view.dom.contains(dom.anchorNode)) return false;
    return editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset) === editor.state.selection.head;
  },
  /** What copying the first node of a type puts on the clipboard, made the way the editor's own copy makes it. */
  copy(type: string): string {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found === -1 && node.type.name === type) found = pos;
      return found === -1;
    });
    const slice = NodeSelection.create(editor.state.doc, found).content();
    return editor.view.serializeForClipboard(slice).dom.innerHTML;
  },
  save(): string {
    return toMarkset(editor.getJSON() as JSONNode, original);
  },
  /** Save every document in turn, unedited, and name the ones that did not come back whole. */
  roundTrip(documents: Array<{ name: string; source: string }>): string[] {
    const failed: string[] = [];
    for (const { name, source } of documents) {
      harness.load(source);
      if (harness.save() !== source) failed.push(name);
    }
    return failed;
  },
  insert(name: ConstructName): boolean {
    return editor.chain().focus().insertConstruct(name).run();
  },
  remove(name: ConstructName): boolean {
    return editor.commands.removeConstruct(name);
  },
  pasteHTML(html: string): void {
    editor.view.pasteHTML(html);
  },
  pasteText(text: string): void {
    editor.view.pasteText(text);
  },
};

(window as unknown as { harness: typeof harness }).harness = harness;
