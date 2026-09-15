import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "@markset/parser";
import { renderHtml } from "../src/index.ts";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
const drawers = { ascii: () => SVG };

const FENCE = "```ascii\n+---+\n| a |\n+---+\n```\n";
const CAPTIONED = `:::figure[A hub and its edges]\n${FENCE}:::\n`;

const render = (source: string, options = {}) => renderHtml(parseDocument(source).ast, options);

test("a captioned diagram fence is drawn in place of the code block", () => {
  const out = render(CAPTIONED, { diagrams: { drawers } });
  assert.match(out, /<img class="ms-diagram" data-diagram="ascii"/u);
  assert.match(out, /src="data:image\/svg\+xml,/u);
  assert.doesNotMatch(out, /<pre>/u, "the code block is replaced, not duplicated");
});

test("drawing is off unless asked for, and off is a correct rendering", () => {
  // §10 obligation 1. Every renderer that cannot draw is conformant.
  const out = render(CAPTIONED);
  assert.match(out, /<pre><code class="language-ascii">/u);
  assert.doesNotMatch(out, /ms-diagram/u);
});

test("a language with no drawer stays a code block", () => {
  const out = render(":::figure[A graph]\n```dot\ndigraph {}\n```\n:::\n", { diagrams: { drawers } });
  assert.match(out, /<pre><code class="language-dot">/u);
});

test("the caption becomes the text alternative", () => {
  const out = render(CAPTIONED, { diagrams: { drawers } });
  assert.match(out, /alt="A hub and its edges"/u);
});

test("an uncaptioned diagram is never drawn", () => {
  // §10 obligation 7, and the reason it exists: drawing without a text
  // alternative takes the content away from a reader who cannot see it, while
  // giving it to everyone else. The code block is the honest output.
  const out = render(`:::figure\n${FENCE}:::\n`, { diagrams: { drawers } });
  assert.match(out, /<pre><code class="language-ascii">/u);
  assert.doesNotMatch(out, /ms-diagram/u);
});

test("a fence outside a figure is never drawn, because it cannot be captioned", () => {
  const out = render(FENCE, { diagrams: { drawers } });
  assert.match(out, /<pre><code class="language-ascii">/u);
});

test("a drawer that throws leaves the content in place and reports", () => {
  const errors: string[] = [];
  const out = render(CAPTIONED, {
    diagrams: {
      drawers: {
        ascii: () => {
          throw new Error("no layout engine");
        },
      },
      onError: (error: Error) => errors.push(error.message),
    },
  });
  assert.match(out, /<pre><code class="language-ascii">/u, "a failed diagram never removes content");
  assert.deepEqual(errors, ["no layout engine"]);
});

test("a drawer that returns something other than SVG is a failure, not an image", () => {
  // The CLI path runs a command the operator named, so stdout can be a usage
  // message or a stack trace. Embedding that would produce a broken image
  // where the spec promises a code block.
  const errors: string[] = [];
  const out = render(CAPTIONED, {
    diagrams: { drawers: { ascii: () => "command not found" }, onError: (e: Error) => errors.push(e.message) },
  });
  assert.match(out, /<pre><code class="language-ascii">/u);
  assert.equal(errors.length, 1);
});

test("a drawer declining by returning null is silent", () => {
  const errors: string[] = [];
  const out = render(CAPTIONED, {
    diagrams: { drawers: { ascii: () => null }, onError: (e: Error) => errors.push(e.message) },
  });
  assert.match(out, /<pre><code class="language-ascii">/u);
  assert.deepEqual(errors, [], "declining is not failing");
});

test("an XML declaration or comment before the root element is still SVG", () => {
  const out = render(CAPTIONED, {
    diagrams: { drawers: { ascii: () => `<?xml version="1.0"?>\n<!-- drawn -->\n${SVG}` } },
  });
  assert.match(out, /ms-diagram/u);
});

test("drawing does not change the AST it was given", () => {
  // §10 obligation 3. The substitution happens on the hast tree, so a caller
  // that renders twice — once drawn, once not — gets the same document both
  // times, and a caller that also downgrades is unaffected.
  const { ast } = parseDocument(CAPTIONED);
  const before = JSON.stringify(ast);
  renderHtml(ast, { diagrams: { drawers } });
  assert.equal(JSON.stringify(ast), before);
  assert.match(renderHtml(ast), /<pre><code class="language-ascii">/u, "and it still renders undrawn");
});
