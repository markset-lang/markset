/**
 * Writes `css/constructs.css`: the default stylesheet's `.ms-` rules, scoped to
 * `.ms-scope`, with the tokens `body` carried set there instead.
 *
 * A host application (Mantine, say) that shows Markset inside its own
 * interface wants the constructs styled and nothing else: markset.css also
 * styles `body`, headings, links, tables and code bare, which would restyle the
 * whole application. This keeps every rule whose selector names an `ms-` class
 * or a construct's `data-` variant, drops the rest, keeps only the custom
 * properties and `color-scheme` of the rules for `body`, and puts everything
 * under `.ms-scope`, which the host puts on the element the document is shown
 * in. `pnpm run tiptap:css` writes it; a test holds the committed file to this.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultStylesheetPath, scopeStylesheet } from "@markset-lang/render-html";

export const CONSTRUCTS_CSS = fileURLToPath(new URL("css/constructs.css", import.meta.url));

const HEADER = `/*
 * Markset's constructs, for a page that is not all Markset. Generated from
 * @markset-lang/render-html/css/markset.css by packages/tiptap/stylesheet.ts
 * (pnpm run tiptap:css); do not edit it by hand.
 *
 * Only the rules for the ms- classes and the constructs' data- variants are
 * here, each under .ms-scope, and .ms-scope carries the tokens markset.css
 * sets on body. Nothing styles the host's body, headings, links, tables or
 * code. Put the class on the element a document is shown in.
 */
`;

export function constructsStylesheet(): string {
  const css = readFileSync(defaultStylesheetPath, "utf8");
  const scoped = scopeStylesheet(css, {
    scope: ".ms-scope",
    keep: (selector) =>
      !selector.includes(".ms-document") &&
      (/\.ms-/u.test(selector) || /^\[data-/u.test(selector) || /^body(?![\w-])/u.test(selector)),
    bodyDeclarations: (property) => property.startsWith("--") || property === "color-scheme",
  });
  // Blank lines left where dropped rules were, folded to one.
  const tidy = scoped.replace(/[ \t]+$/gmu, "").replace(/\n{3,}/gu, "\n\n");
  return `${HEADER}${tidy.trim()}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(CONSTRUCTS_CSS, constructsStylesheet());
  console.log(`wrote ${CONSTRUCTS_CSS}`);
}
