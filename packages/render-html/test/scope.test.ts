import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeStylesheet } from "../src/index.ts";

test("by default every rule goes under .ms-document, and body becomes it", () => {
  assert.equal(
    scopeStylesheet('body[data-preset="report"] { --x: 1; }\nth, td { padding: 0; }\n.ms-document > * { x: y; }'),
    '.ms-document[data-preset="report"] { --x: 1; }\n.ms-document th, .ms-document td { padding: 0; }\n.ms-document > * { x: y; }',
  );
  assert.equal(
    scopeStylesheet("@media print {\n  a { color: inherit; }\n}"),
    "@media print {\n  .ms-document a { color: inherit; }\n}",
  );
});

test("a selector list is split at its own commas, not those inside :is() or an attribute value", () => {
  assert.equal(
    scopeStylesheet('.a > :is(h1, h2), [data-x="1,2"] { x: y; }', { scope: ".s" }),
    '.s .a > :is(h1, h2), .s [data-x="1,2"] { x: y; }',
  );
});

test("keep drops selectors, a rule left with none, and an at-rule left with no rule", () => {
  const css =
    "a, .ms-card { x: y; }\nh1 { x: y; }\n@media print { h1 { x: y; } }\n@media screen { .ms-grid { x: y; } }";
  assert.equal(
    scopeStylesheet(css, { scope: ".s", keep: (s) => s.includes(".ms-") }),
    ".s .ms-card { x: y; }\n@media screen { .s .ms-grid { x: y; } }",
  );
});

test("bodyDeclarations keeps the tokens of body's rules and drops the rest", () => {
  assert.equal(
    scopeStylesheet("body {\n  --ms-a: 1;\n  margin: 0;\n  color-scheme: light dark;\n}\nbody { margin: 0; }", {
      scope: ".s",
      bodyDeclarations: (p) => p.startsWith("--") || p === "color-scheme",
    }),
    ".s {\n  --ms-a: 1;\n  color-scheme: light dark;\n}",
  );
});

test("unbalanced braces are an error", () => {
  assert.throws(() => scopeStylesheet("a { x: y;"), /unbalanced/u);
  assert.throws(() => scopeStylesheet("a { x: y; } }"), /unbalanced/u);
});
