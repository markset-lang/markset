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
There is no migration. A Markset file *is* a Markdown file, so the way in is to keep every document you have and reach for a construct only on the pages that need one. Here is the whole idea, in two lines — or skip the reading and try it in the [playground](../playground/index.html), which runs the same renderer in your browser.

{.tick}
***

{.eyebrow}
The smallest useful change

## Two lines

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
Nothing. That page is plain CommonMark, which means it is already a valid Markset document. You have adopted nothing and lost nothing.
:::
::::

Now declare the version and turn the list into tiles. Two lines changed, and the second one is a fence:

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
Rendered with `markset html`. Paste that same source into a pull request and the three bullets come back, in order, with the fence lines showing as text. Nothing is lost where the layout cannot follow — that is the contract, and every construct has one.
::::

The `markset: 0` line says which version of the specification the document is written against. The parser does not require it; tools read it to decide that a `.md` file is meant to be Markset, which protects files using `:::` for something else.

{.tick}
***

{.eyebrow}
When it helps

## Whether this is for you

You have Markdown that has outgrown Markdown: a page that needs three things side by side, a set of tiles, a procedure that should read as a procedure. The usual answer is to drop into raw HTML, and the moment you do, the file stops being portable — it will not paste into an issue, it will not typeset to print, and a future renderer has to cope with whatever tags you left behind.

:::grid{cols=2}
- ### Worth it

  Documentation in a repository that a generator turns into a site. Analyses and incident write-ups that get pasted into issues and chat. Anything that has to outlive the tool rendering it — a closed vocabulary with a specification and a test suite means a second implementation can be written from the document alone.

- ### Not worth it

  A page that is fine as prose. Markset earns its place where layout carries meaning, and nowhere else. If no page in your repository wants three columns, you do not need this.
:::

> [!NOTE]
> **It is not a site generator and not a component framework.** Markset gives you a document format and two things that read it: `markset html`, which produces HTML, and `markset downgrade`, which produces plain CommonMark with the layout lowered away. Whatever builds your site keeps building your site.

{.tick}
***

{.eyebrow}
Fitting it in

## Five ways to adopt it

:::steps
1. ### Author in it and change nothing else

   The cheapest option, and a real one. Write constructs in your Markdown and let your existing renderer show the fallback: a grid is a list, a card is a heading and its body, a metrics block is a table. You get a document that is better organized at the source level today, and rich when you decide to render it properly.

   The only thing to add is validation, so a typo fails in review rather than shipping. In Visual Studio Code the [extension](../editor/index.html) does this as you type; anywhere else it is one command:

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

4. ### Add it to the remark pipeline you already run

   If your site runs on Astro, Next, Eleventy, Gatsby or anything else built on [remark](https://unifiedjs.com), this is one plugin and no other change. Markset is micromark and mdast underneath, so it joins the pipeline you have rather than replacing it.

   ```js
   import remarkMarkset from "@markset-lang/remark-markset";
   import { marksetHandlers } from "@markset-lang/render-html";

   unified()
     .use(remarkParse)
     .use(remarkMarkset)
     .use(remarkRehype, { handlers: marksetHandlers() })
     .use(rehypeStringify);
   ```

   Constructs become typed mdast nodes, attributes are carried as `hProperties`, and diagnostics arrive as ordinary vfile messages — so a pipeline that already reports those reports Markset's without being taught anything. It turns on Markset and nothing else: tables stay `remark-gfm` and frontmatter stays `remark-frontmatter`.

5. ### Call it as a library

   For a generator you control, skip the process boundary. The parse result is mdast plus a few node types, so anything in the unified ecosystem can walk it.

   ```js
   import { parseDocument } from "@markset-lang/parser";
   import { renderHtml } from "@markset-lang/render-html";

   const { ast, diagnostics } = parseDocument(source);
   if (diagnostics.some((d) => d.severity === "error")) throw new Error("invalid document");
   const body = renderHtml(ast);
   ```
:::

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
| Diagrams need an engine | An ASCII fence is drawn out of the box. Any other diagram language — mermaid, graphviz — is a code block until you name a command that draws it, and stays a readable code block if you never do. |
:::

{.eyebrow}
Next

## Where to go from here

Three of these are things to do and three are things to read. Take whichever matches what you came for.

::::columns{ratio="1:1:1"}
:::card[Write it in your editor]{tone=info}
**[The Visual Studio Code extension](../editor/index.html)** checks a document as you type, renders it in the Markdown preview you already use, and offers every construct after `:::`. Install it from the marketplace and nothing else changes.
:::

::col

:::card[Publish a site]
**[Publishing to GitHub Pages](../github-pages/index.html)** is the whole recipe on one page: a workflow file to copy, two commands, and the three things that are easy to get wrong. This site is built that way, which is the only reason to trust any of it.
:::

::col

:::card[Render it yourself]
**[The markset command](../cli/index.html)** is five commands and their flags — check a document, render it, lower it to plain CommonMark, print the tree, or write the stylesheet a site links once.
:::
::::

Then, as you need them:

- The [reference](../reference/index.html) starts with the three pieces of syntax every construct is built from, then gives a page per construct with four worked examples each — plus [frontmatter and theme tokens](../reference/frontmatter/index.html) for the settings a document carries about itself, and [diagrams](../reference/diagrams/index.html) for turning an ASCII or mermaid fence into a picture.
- The [examples](../examples/index.html) are what a long document looks like once it has a theme of its own.
- The [specification](../spec/index.html) is the normative answer. It is short, and it is what a second implementation would be written from.
