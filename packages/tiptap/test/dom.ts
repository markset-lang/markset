/** A DOM for tests: happy-dom's window, installed as the globals TipTap and ProseMirror reach for. */
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
const globals = globalThis as Record<string, unknown>;
for (const name of [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Text",
  "DocumentFragment",
  "MutationObserver",
  "DOMParser",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getSelection",
  "Event",
  "KeyboardEvent",
  "InputEvent",
  "ClipboardEvent",
]) {
  if (!(name in globals) || name === "navigator") {
    const value = (window as unknown as Record<string, unknown>)[name];
    Object.defineProperty(globals, name, {
      value: typeof value === "function" && /^[a-z]/.test(name) ? value.bind(window) : value,
      configurable: true,
      writable: true,
    });
  }
}
export { window };
