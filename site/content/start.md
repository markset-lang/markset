---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Getting started

# Enrich the Markdown you already have

{.lead}
Markset is not a new format to migrate to. A Markset file is a Markdown file, so the way in is to keep the documents you have and start using constructs in the pages that need them. This page covers when that is worth doing, and the four ways to fit it into something you already run.

{.tick}
***

{.eyebrow}
When it helps

## The problem it solves

You have Markdown that has outgrown Markdown. A page needs three things side by side, or a set of tiles, or a procedure that reads as a procedure. The usual answer is to drop into raw HTML, and the moment you do, the file stops being portable: it will not paste into an issue, it will not typeset to print, and a future renderer has to cope with whatever tags you left behind.

Markset is the other answer. You name the layout instead of building it, and the name has a defined fallback, so the file keeps working everywhere it used to work.

:::grid{cols=2}
- ### An internal documentation site

  The common case, and the one this project was written for. Pages are Markdown in a repository, a generator turns them into a site, and some of them want to be richer than a wall of prose. You keep the repository, the review process and the file format, and the pages that need more get it.

- ### A public site or GitHub Pages

  Same shape, published. The site you are reading is the worked example: every page is a Markset document, built by the reference implementation, deployed by a workflow. There is no framework underneath it.

- ### Documents that get pasted around

  Analyses, incident write-ups, proposals. These end up in issues, pull requests and chat, where nothing renders your layout. A Markset document degrades to readable Markdown in those places rather than to a soup of angle brackets.

- ### Content that has to outlive its renderer

  A closed vocabulary with a specification and a test suite means a second implementation can be written from the document alone. That is a different promise from a template language tied to one generator.
:::

> [!NOTE]
> **It is not a site generator and not a component framework.** Markset gives you a document format and two things that read it: `markset html`, which produces HTML, and `markset downgrade`, which produces plain CommonMark with the layout lowered away. Whatever builds your site keeps building your site.

{.tick}
***

{.eyebrow}
Fitting it in

## Four ways to adopt it

:::steps
1. ### Author in it and change nothing else

   The cheapest option, and a real one. Write constructs in your Markdown and let your existing renderer show the fallback: a grid is a list, a card is a heading and its body, a metrics block is a table. You get a document that is better organized at the source level today, and rich when you decide to render it properly.

   The only thing to add is validation, so a typo fails in review rather than shipping:

   ```sh
   markset check docs/*.md
   ```

2. ### Render to HTML and let your generator embed it

   If your site generator takes HTML, this is a preprocessing step. Render each page to a fragment and hand it over, with the stylesheet linked once in your layout.

   ```sh
   markset html docs/architecture.md --fragment -o build/architecture.html
   ```

   The fragment carries `ms-` class names and nothing else. Link the default stylesheet, or your own, from your existing template.

3. ### Downgrade first, if your generator must stay untouched

   If you cannot change the pipeline at all, lower the constructs away before the generator sees them. The output is ordinary CommonMark that anything handles.

   ```sh
   markset downgrade docs/architecture.md -o build/architecture.md
   ```

   You keep the structured source and lose only the layout, which is the same trade the fallback makes anywhere else.

4. ### Call it as a library

   For a generator you control, skip the process boundary. The parse result is mdast plus a few node types, so anything in the unified ecosystem can walk it.

   ```js
   import { parseDocument } from "@markset/parser";
   import { renderHtml } from "@markset/render-html";

   const { ast, diagnostics } = parseDocument(source);
   if (diagnostics.some((d) => d.severity === "error")) throw new Error("invalid document");
   const body = renderHtml(ast);
   ```
:::

{.tick}
***

{.eyebrow}
A first page

## Enriching a page you already have

Take a page that is already in your repository. This one is fine as it is, and it is the shape most documentation is in:

::::columns{ratio="1:1"}
```markdown
## Deployment

Three environments, in order.

- Staging, deployed on merge
- Canary, one percent of traffic
- Production, manual promotion

Rollback takes about four minutes.
```

::col

:::card[What it costs you]{tone=info}
Nothing yet. The page above is plain CommonMark, which means it is already a valid Markset document. You have not adopted anything.
:::
::::

Now declare the version and turn the list into tiles. Two lines changed:

::::columns{ratio="1:1"}
```markdown
---
markset: 0
---

## Deployment

Three environments, in order.

:::grid{cols=3}
- **Staging** — deployed on merge
- **Canary** — one percent of traffic
- **Production** — manual promotion
:::

Rollback takes about four minutes.
```

::col

:::grid{cols=3}
- **Staging** — deployed on merge
- **Canary** — one percent of traffic
- **Production** — manual promotion
:::

{.small .muted}
Rendered with `markset html`. Paste the same source into a pull request and you get the three bullets back, in order, with the fence lines showing as text.
::::

The `markset: 0` line declares which version of the specification the document is written against. The parser does not require it; tools use it to decide that a `.md` file is meant to be Markset, which protects files that use `:::` for something else.

{.tick}
***

{.eyebrow}
Honest constraints

## What to know before you commit

:::figure[The things worth understanding up front, and what each one actually means in practice.]
| Constraint | What it means |
|---|---|
| GitHub shows the fallback, not the layout | A grid renders as a list in a repository preview. Callouts are the exception: they use GitHub's own alert syntax and render natively. |
| Rich output needs a build step | Something has to run the renderer. That is one command, with no configuration file, but it is not nothing. |
| Themes are yours to write | Eight constructs come styled by the default stylesheet. Author classes beyond the reserved ones mean whatever your stylesheet says, and you write that stylesheet. |
| The vocabulary is closed | There are eight constructs and an unknown name is an error. If you need a ninth, the answer is a class and a theme rule, not a new directive. |
| Nothing executes | No expressions, no includes, no components. A document is data. If you need computation, it happens before the document exists. |
| Diagrams need a drawer | An ASCII fence is drawn out of the box. Any other diagram language — mermaid, graphviz — is a code block until you name a command that draws it, and stays a readable code block if you never do. |
:::

{.tick}
***

{.eyebrow}
Next

## Where to go from here

:::steps
1. Read the [reference](reference/index.html). It starts with the three pieces of syntax every construct is built from, then gives one page per construct with four worked examples each, a page on [frontmatter and theme tokens](reference/frontmatter/index.html) for the settings a document carries about itself, and a page on [diagrams](reference/diagrams/index.html) for turning an ASCII or mermaid fence into a picture.
2. Skim the [CLI page](cli/index.html) for the four commands and their flags.
3. Look at the [examples](examples/index.html) to see what a long document looks like when it has a theme of its own.
4. Read the [specification](spec/index.html) when you want the normative answer. It is short, and it is what a second implementation would be written from.
:::
