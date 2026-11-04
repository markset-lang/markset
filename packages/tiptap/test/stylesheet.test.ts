import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONSTRUCTS_CSS, constructsStylesheet } from "../stylesheet.ts";

const css = readFileSync(CONSTRUCTS_CSS, "utf8");

/** Every selector of every rule, at-rules' preludes left out, split at the list's own commas. */
function selectors(text: string): string[] {
  const bare = text.replace(/\/\*[\s\S]*?\*\//gu, "");
  return [...bare.matchAll(/(?:^|[{};])\s*([^@{};]+?)\s*\{/gu)].flatMap((m) =>
    m[1].split(/,(?![^(]*\))/u).map((s) => s.trim()),
  );
}

test("css/constructs.css is what stylesheet.ts generates from markset.css (pnpm run tiptap:css)", () => {
  assert.equal(css, constructsStylesheet());
});

test("every rule in it is under .ms-scope, and none styles the host's own elements", () => {
  const all = selectors(css);
  assert.ok(all.length > 80, `only ${all.length} selectors`);
  for (const selector of all) assert.match(selector, /^\.ms-scope(?![\w-])/u, selector);
  for (const selector of all) {
    const rest = selector.slice(".ms-scope".length).trim();
    assert.ok(
      rest === "" || rest.startsWith("[") || /\.ms-|^\[data-/u.test(rest),
      `not a construct's rule: ${selector}`,
    );
  }
  assert.doesNotMatch(css, /\.ms-document/u);
});

test("the scope carries the tokens and only the tokens body had", () => {
  const scope = /\n\.ms-scope \{([^}]*)\}/u.exec(css)?.[1] ?? "";
  assert.match(scope, /--ms-accent:/u);
  assert.match(scope, /color-scheme: light dark;/u);
  assert.doesNotMatch(scope, /(^|\s)(margin|background|font-family|color):/u);
});

test("it keeps what makes tabs work and metrics tiles", () => {
  assert.match(css, /\.ms-scope \.ms-tab-input:nth-of-type\(1\):checked ~ \.ms-tabpanel\[data-index="1"\]/u);
  assert.match(css, /\.ms-scope \.ms-metrics \{ display: grid;/u);
  assert.match(css, /\.ms-scope \.ms-grid-item/u);
  assert.match(css, /\.ms-scope \.ms-step::before/u);
});
