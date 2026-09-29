/**
 * The live editor on the "Editing visually" page.
 *
 * The page is a Markset document like every other, and it already shows the
 * sample rendered beside its source, which is what a reader without JavaScript
 * keeps. This script swaps that pair for a TipTap editor holding the same
 * document and the Markset file it saves to, updated as the reader types, with
 * every line that now differs from the loaded file highlighted.
 */
import { Editor } from "@tiptap/core";
import { CONSTRUCTS, Markset, fromMarkset, toMarkset, type ConstructName, type JSONNode } from "@markset-lang/tiptap";
import { lineChanges } from "./diff.ts";

const root = document.getElementById("try-editor");
const original = root?.querySelector("pre code")?.textContent;
if (root && original) mount(root, original);

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mount(root: HTMLElement, source: string): void {
  const demo = element("div", "te-demo");
  demo.id = "try-editor";

  const toolbar = element("div", "te-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Editor");
  const panes = element("div", "te-panes");
  const editorPane = element("div", "te-pane te-editor");
  const sourcePane = element("div", "te-pane te-source");
  const sourceHead = element("div", "te-source-head");
  const fileName = element("span", "te-file", "harbor-2.4.md");
  const status = element("span", "te-status");
  status.setAttribute("aria-live", "polite");
  sourceHead.append(fileName, status);
  const pre = element("pre", "te-code");
  const code = element("code", "");
  pre.append(code);
  sourcePane.append(sourceHead, pre);
  panes.append(editorPane, sourcePane);
  demo.append(toolbar, panes);
  root.replaceWith(demo);

  const editor = new Editor({
    element: editorPane,
    extensions: [Markset],
    content: fromMarkset(source).doc as never,
    onUpdate: () => schedule(),
    onSelectionUpdate: () => refreshButtons(),
  });
  editorPane.querySelector(".ProseMirror")?.setAttribute("aria-label", "Markset document");

  const button = (label: string, title: string, run: () => boolean, active?: () => boolean) => {
    const b = element("button", "te-button", label);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", () => {
      run();
      editor.commands.focus();
    });
    toolbar.append(b);
    if (active) activeChecks.push(() => b.setAttribute("aria-pressed", String(active())));
    return b;
  };
  const activeChecks: Array<() => void> = [];
  const group = (label: string) => toolbar.append(element("span", "te-group", label));

  button(
    "B",
    "Bold",
    () => editor.chain().focus().toggleMark("bold").run(),
    () => editor.isActive("bold"),
  );
  button(
    "I",
    "Italic",
    () => editor.chain().focus().toggleMark("italic").run(),
    () => editor.isActive("italic"),
  );
  group("Insert");
  for (const name of CONSTRUCTS)
    button(name, `Insert a ${name}`, () =>
      editor
        .chain()
        .focus()
        .insertConstruct(name as ConstructName)
        .run(),
    );
  const reset = button("Reset", "Put the document back the way it was loaded", () => {
    editor.commands.setContent(fromMarkset(source).doc as never);
    return true;
  });
  reset.classList.add("te-reset");

  function refreshButtons(): void {
    for (const check of activeChecks) check();
  }

  let pending = false;
  function schedule(): void {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  }

  function render(): void {
    refreshButtons();
    let saved: string;
    try {
      saved = toMarkset(editor.getJSON() as JSONNode, source);
    } catch (error) {
      status.textContent = `Not saved: ${(error as Error).message}`;
      return;
    }
    const { changed, removed } = lineChanges(source, saved);
    const lines = saved.replace(/\n$/, "").split("\n");
    code.replaceChildren(
      ...lines.map((line, index) => {
        const row = element("span", changed.has(index) ? "te-line te-changed" : "te-line", line === "" ? "​" : line);
        return row;
      }),
    );
    // A retyped line is one line gone and one line new, so it counts once, as changed.
    const deleted = Math.max(0, removed - changed.size);
    const kept = lines.length - changed.size;
    if (changed.size === 0 && deleted === 0) status.textContent = "Unchanged: byte for byte the file that was loaded";
    else if (changed.size === 0)
      status.textContent = `${plural(deleted, "line")} deleted; the other ${kept} as written`;
    else {
      status.textContent = `${plural(changed.size, "line")} changed${deleted ? `, ${deleted} deleted` : ""}; the other ${kept} as written`;
    }
  }

  render();
}

function plural(n: number, what: string): string {
  return `${n} ${what}${n === 1 ? "" : "s"}`;
}
