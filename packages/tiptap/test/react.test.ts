import "./dom.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Editor, EditorContent, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Markset, fromMarkset, toMarkset, type JSONNode } from "../src/index.ts";
import { REACT_NODES, reactNodeViews, reactProps } from "../src/react.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("HTML attributes become React props", () => {
  assert.deepEqual(reactProps({ class: "ms-columns", style: "--ms-ratio: 2fr 1fr", "data-gap": "md" }), {
    className: "ms-columns",
    style: { "--ms-ratio": "2fr 1fr" },
    "data-gap": "md",
  });
});

test("the React node views draw each construct with its ms- class, and saving is unaffected", async () => {
  const source = ":::card[Title]{tone=info}\nBody.\n:::\n\n:::grid{cols=3}\n- a\n- b\n:::\n";
  const editor = new Editor({
    extensions: [Markset.configure({ nodeViews: reactNodeViews() })],
    content: fromMarkset(source).doc as never,
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host as never);
  await act(async () => {
    root.render(createElement(EditorContent, { editor }));
  });
  const card = host.querySelector(".ms-card");
  assert.ok(card, host.innerHTML);
  assert.equal(card.getAttribute("data-tone"), "info");
  assert.ok(card.hasAttribute("data-node-view-wrapper"), "drawn by the React view");
  assert.ok(host.querySelector('.ms-grid[data-cols="3"]'));
  assert.equal(toMarkset(editor.getJSON() as JSONNode, source), source);
  await act(async () => root.unmount());
  editor.destroy();
});

test("a host replaces one construct's view and keeps the rest", async () => {
  const Custom = () => createElement(NodeViewWrapper, { className: "host-card" }, createElement(NodeViewContent));
  const views = reactNodeViews({ card: Custom });
  assert.deepEqual(Object.keys(views).sort(), [...REACT_NODES].sort());
  const editor = new Editor({
    extensions: [Markset.configure({ nodeViews: views })],
    content: fromMarkset(":::card\nx\n:::\n").doc as never,
  });
  const host = document.createElement("div");
  const root = createRoot(host as never);
  await act(async () => {
    root.render(createElement(EditorContent, { editor }));
  });
  assert.ok(host.querySelector(".host-card"), host.innerHTML);
  assert.equal(host.querySelector(".ms-card"), null);
  await act(async () => root.unmount());
  editor.destroy();
});
