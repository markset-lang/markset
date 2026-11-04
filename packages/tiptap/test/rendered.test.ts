import "./dom.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Editor, type AnyExtension } from "@tiptap/core";
import { parseDocument } from "@markset-lang/parser";
import { renderHtml } from "@markset-lang/render-html";
import { CONSTRUCTS, Markset, fromMarkset, mdastToJSON, renderedNodeViews } from "../src/index.ts";
import { window } from "./dom.ts";
import { HOST, MARKSET_IN_HOST, STARTER_KIT_AND_TABLE_KIT } from "./host-schema.ts";

const repo = new URL("../../../", import.meta.url).pathname;

function cases(section: string): Array<{ name?: string; markset: string }> {
  return JSON.parse(readFileSync(`${repo}tests/${section}.json`, "utf8"));
}

/**
 * HTML as a comparable string: whitespace-only text gone and the rest trimmed,
 * attributes sorted, and what is the editor's own rather than the document's
 * left out: the kit's `data-ms` attributes, ProseMirror's classes and
 * `contenteditable`, and the numbers in generated names, which render-html
 * counts per document and the views count per page.
 */
function normalize(html: string): string {
  const host = window.document.createElement("div");
  host.innerHTML = html;
  const write = (node: globalThis.Node): string => {
    if (node.nodeType === 3) return (node.textContent ?? "").trim().replace(/\s+/gu, " ");
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    const attributes = [...element.attributes]
      .filter((a) => !a.name.startsWith("data-ms") && a.name !== "contenteditable" && a.name !== "translate")
      .map((a) => {
        let value = a.value.replace(/\bms-(tabs|callout)-\d+/gu, "ms-$1-N");
        if (a.name === "class")
          value = value
            .split(/\s+/u)
            .filter((c) => c && !c.startsWith("ProseMirror"))
            .join(" ");
        return value === "" && a.name === "class" ? "" : `${a.name}="${value}"`;
      })
      .filter(Boolean)
      .sort();
    const children = [...element.childNodes].map(write).filter((s) => s !== "");
    const tag = element.tagName.toLowerCase();
    return `<${[tag, ...attributes].join(" ")}>${children.join("")}</${tag}>`;
  };
  return [...(host.childNodes as unknown as globalThis.Node[])]
    .map(write)
    .filter((s) => s !== "")
    .join("\n");
}

function shown(extensions: AnyExtension[], content: unknown): string {
  const element = window.document.createElement("div");
  const editor = new Editor({ element: element as never, extensions, editable: false, content: content as never });
  const html = editor.view.dom.innerHTML;
  editor.destroy();
  return html;
}

const rendered = (source: string) =>
  normalize(renderHtml(parseDocument(source).ast, { headingIds: false, diagrams: false, charts: false }));

for (const name of CONSTRUCTS) {
  const canonical = cases(name).find((c) => c.name === "canonical")!;

  test(`${name}: the rendered view of the canonical case is render-html's output`, () => {
    const kit = [Markset.configure({ nodeViews: renderedNodeViews() })];
    assert.equal(normalize(shown(kit, fromMarkset(canonical.markset).doc)), rendered(canonical.markset));
  });

  test(`${name}: and the same beside StarterKit and TableKit`, () => {
    const host = [
      ...STARTER_KIT_AND_TABLE_KIT,
      MARKSET_IN_HOST.configure({ nodeViews: renderedNodeViews({ imageNode: "image" }) }),
    ];
    const content = mdastToJSON(parseDocument(canonical.markset).ast, HOST);
    assert.equal(normalize(shown(host, content)), rendered(canonical.markset));
  });
}

test("every valid case of the eight construct sections is drawn as render-html draws it", () => {
  const kit = [Markset.configure({ nodeViews: renderedNodeViews() })];
  let compared = 0;
  for (const name of CONSTRUCTS) {
    for (const [index, c] of cases(name).entries()) {
      if (parseDocument(c.markset).diagnostics.some((d) => d.severity === "error")) continue;
      assert.equal(normalize(shown(kit, fromMarkset(c.markset).doc)), rendered(c.markset), `${name}.json #${index}`);
      compared++;
    }
  }
  assert.ok(compared > 60, `${compared} cases compared`);
});

test("the open tab is the view's: a click opens another, an update keeps it, and the document never holds it", () => {
  const element = window.document.createElement("div");
  window.document.body.append(element);
  const source = ":::tabs\n### One\nFirst.\n\n### Two\nSecond.\n:::\n\nAfter.\n";
  const editor = new Editor({
    element: element as never,
    extensions: [Markset.configure({ nodeViews: renderedNodeViews() })],
    editable: false,
    content: fromMarkset(source).doc as never,
  });
  const before = JSON.stringify(editor.getJSON());
  const radios = () => [...element.querySelectorAll("input.ms-tab-input")] as unknown as HTMLInputElement[];
  assert.deepEqual(
    radios().map((r) => r.checked),
    [true, false],
  );
  (element.querySelectorAll("label.ms-tab")[1] as unknown as HTMLLabelElement).click();
  assert.deepEqual(
    radios().map((r) => r.checked),
    [false, true],
    "the second label opens the second panel",
  );
  assert.equal(JSON.stringify(editor.getJSON()), before, "the document does not record which tab is open");
  // An update to the node, as a host's setContent or a collaborator's change would make it.
  let pos = -1;
  editor.state.doc.descendants((node, at) => {
    if (pos === -1 && node.type.name === "tabs") pos = at;
  });
  const attrs = editor.state.doc.nodeAt(pos)!.attrs;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, classes: ["changed"] }));
  assert.ok(element.querySelector(".ms-tabs.changed"), "the view drew the update");
  assert.deepEqual(
    radios().map((r) => r.checked),
    [false, true],
    "and the open tab survived it",
  );
  assert.equal(editor.state.doc.nodeAt(pos)!.attrs.active, 1);
  editor.destroy();
  element.remove();
});
