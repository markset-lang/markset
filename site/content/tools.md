---
markset: 0
theme:
  preset: technical
---

{.eyebrow}
Tools

# Where you can use it

{.lead}
Every tool here runs the same parser and renderers, so a document checks and renders the same way in each. Pick the
ones that fit where your documents are written, reviewed and published.

:::grid{cols=2 .tiles}
- **VS Code**

  Review what an agent wrote in the Markdown preview you already use. Every construct is offered after `:::`, and a
  mistake is underlined as you type.

  [[Set up the extension](../editor/index.html)]{.button .small}

- **The markset command**

  Check a document, which is how an agent checks its own, render it to HTML, or lower it to plain CommonMark. It also
  carries the guide agents write from.

  [[The markset command](../cli/index.html)]{.button .small}

- **The visual editor**

  A TipTap editor for people who should never see the syntax. Saving writes Markset back and changes only the lines
  they edited.

  [[Try the editor](../tiptap/index.html)]{.button .small}

- **The remark plugin**

  Add Markset to the Astro, Next or Eleventy build you already run, as one remark plugin, without replacing anything
  around it.

  [[The remark plugin](../remark/index.html)]{.button .small}

- **GitHub Pages**

  Publish a folder of Markset documents as a site with one workflow file. This site is built that way.

  [[The recipe](../github-pages/index.html)]{.button .small}

- **The playground**

  The parser and both renderers in your browser: the page, its HTML, the plain-Markdown fallback and the diagnostics.
  Nothing you type leaves the page.

  [[Open the playground](../playground/index.html)]{.button .small}
:::
