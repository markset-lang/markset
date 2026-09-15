import { test } from "node:test";
import assert from "node:assert/strict";
import { drawAscii } from "../src/index.ts";

const BOX = "+-----+\n| Hub |\n+-----+\n";

test("a box becomes lines and a label, not a picture of characters", () => {
  const svg = drawAscii(BOX);
  assert.ok(svg, "a box draws");
  // Four sides: two horizontal runs, two vertical runs.
  assert.equal([...svg.matchAll(/<path class="l"/gu)].length, 4);
  assert.match(svg, />Hub</u);
  // The + corners are consumed by the lines, so they never reach the text layer.
  assert.doesNotMatch(svg, /<text[^>]*>[^<]*\+/u);
});

test("nothing to draw is null rather than an empty picture", () => {
  assert.equal(drawAscii(""), null);
  assert.equal(drawAscii("   \n\n  \n"), null);
});

test("prose still draws as prose", () => {
  const svg = drawAscii("just some words\n");
  assert.ok(svg);
  assert.doesNotMatch(svg, /<path/u, "no line anywhere in a line of prose");
  assert.match(svg, />just some words</u);
});

test("an arrowhead needs a line arriving at it", () => {
  // The whole reason the rule exists: v is a letter far more often than it is
  // an arrow, and a drawer that guesses wrong corrupts ordinary words.
  const arrow = drawAscii("--->\n");
  assert.ok(arrow);
  assert.match(arrow, /<polygon class="h"/u, "a dash then > is an arrowhead");

  const word = drawAscii("very vexing\n");
  assert.ok(word);
  assert.doesNotMatch(word, /<polygon/u, "a v in a word is not an arrowhead");
  assert.match(word, />very vexing</u, "and the word survives intact");
});

test("all four arrow directions are recognized where a line arrives", () => {
  assert.match(drawAscii("--->\n") ?? "", /<polygon/u);
  assert.match(drawAscii("<---\n") ?? "", /<polygon/u);
  assert.match(drawAscii("|\nv\n") ?? "", /<polygon/u);
  assert.match(drawAscii("^\n|\n") ?? "", /<polygon/u);
});

test("text is XML-escaped, because the SVG is embedded as a data URI", () => {
  // Runs break at spaces, so use a run that holds the character it must escape.
  const svg = drawAscii("a&b\n");
  assert.ok(svg);
  assert.match(svg, />a&amp;b</u);
  const angle = drawAscii("x y\nq <z\n");
  assert.ok(angle);
  assert.doesNotMatch(angle.replace(/<(\/?)(svg|style|g|path|polygon|text)\b[^>]*>/gu, ""), /</u);
});

test("the stylesheet inside the SVG is XML-safe", async () => {
  // Same rule the site already enforces on its hand-drawn SVG: this is XML, so
  // a raw < or & inside <style> is parsed as markup and takes the file with it.
  const svg = drawAscii(BOX);
  assert.ok(svg);
  const style = /<style>([\s\S]*?)<\/style>/u.exec(svg);
  assert.ok(style, "the drawing carries its own styles");
  assert.doesNotMatch(style[1], /[<&]/u, "no raw < or & inside an SVG style element");
  assert.match(style[1], /prefers-color-scheme: dark/u, "and it follows the reader's color scheme");
});

test("the drawing is sized from the grid, so alignment is the author's", () => {
  const svg = drawAscii("abc\nde\n");
  assert.ok(svg);
  // 3 columns x 8px + 2 x 6px padding; 2 rows x 16px + 2 x 6px padding.
  assert.match(svg, /width="36" height="44"/u);
});

test("tabs are expanded so a tabbed diagram does not collapse", () => {
  const svg = drawAscii("\tx\n");
  assert.ok(svg);
  assert.match(svg, /x="32"/u, "one tab is four cells");
});

test("a run of text is one element, pinned to its cells", () => {
  const svg = drawAscii("| Hub |\n");
  assert.ok(svg);
  assert.match(svg, /textLength="24" lengthAdjust="spacing">Hub</u);
});
