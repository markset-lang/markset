---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Guide

# Publishing to GitHub Pages

{.lead}
You have Markdown in a repository and you want it on the web, without adopting a framework to get there. This page is the whole recipe: one workflow file, two commands, and the three things that are easy to get wrong. The site you are reading is built this way, which is the only reason to trust any of it.

[No framework]{.badge} [No configuration file]{.badge} [Two commands]{.badge .info}

> [!IMPORTANT] Markset is not on npm yet
> The packages are still private while the conformance suite settles, so the workflow below checks Markset out and runs it from source rather than installing it. That is the one ugly line in this recipe and it is temporary: when the packages publish, the checkout step and the long paths collapse into `npm i -D @markset-lang/cli` and `markset`. Everything else on this page stays as it is.

{.tick}
***

{.eyebrow}
The shape

## Three files and a folder

:::figure[What a published Markset site is made of. There is no configuration file, and nothing else is required.]
| Path | What it is |
|---|---|
| `docs/*.md` | Your pages. Ordinary Markdown, with constructs where you want them. |
| `.github/workflows/pages.yml` | The workflow below. Renders and deploys on every push to `main`. |
| `theme.css` | Optional. Your own stylesheet, layered over the default one. |
:::

Enable Pages once in the repository settings, with **GitHub Actions** as the source rather than a branch. That is the only thing you do in a browser.

{.tick}
***

{.eyebrow}
The workflow

## Copy this file

```yaml
name: Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: markset-lang/markset
          path: .markset
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm --prefix .markset ci --omit=dev

      - name: Render
        run: |
          mkdir -p dist
          node .markset/packages/cli/src/markset.ts css -o dist/markset.css
          for f in docs/*.md; do
            node .markset/packages/cli/src/markset.ts html "$f" \
              --css markset.css -o "dist/$(basename "$f" .md).html"
          done

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> [!TIP] `--omit=dev` is load-bearing
> Markset's own development dependencies include a headless browser, for drawing mermaid diagrams on this site. You do not need it to render pages, and omitting it takes a large download out of every build of your site.

{.tick}
***

{.eyebrow}
The build

## Two commands do all the work

:::steps
1. ### Write the stylesheet once

   ```sh
   markset css -o dist/markset.css
   ```

   This is the default stylesheet — tokens, the eight constructs, print rules, and light and dark. Emitting it once and linking it keeps every page small. Skip this step and pass no `--css` at all and each page carries its own copy instead, which is fine for one page and wasteful for forty.

2. ### Render each document

   ```sh
   markset html docs/guide.md --css markset.css -o dist/guide.html
   ```

   Each output is a complete HTML page: `<html>`, a title taken from the first level-one heading, the theme tokens from the document's frontmatter, and the body. There is no template to write.

3. ### Check before you publish, not after

   ```sh
   markset check docs/*.md
   ```

   Worth its own step in the workflow, before the render. It exits non-zero on any error, so a misspelled directive fails the build rather than shipping a page with a fence printed in it.
:::

{.tick}
***

{.eyebrow}
Three things to get right

## The parts that bite

:::grid{cols=3}
- ### Links are relative

  A project site is served from `https://you.github.io/repo/`, not from the root. Link with `guide.html` or `../index.html` and never with a leading slash: a path beginning at the root leaves your project entirely and lands on the user page, which probably does not exist. This site has a test that fails the build on one, because it is the mistake that looks fine locally and breaks only once published.

- ### Names become URLs

  `docs/guide.md` becomes `/guide.html`. For a directory-style URL like `/guide/`, write to `dist/guide/index.html` instead. Pick one and keep it: changing later breaks every link anyone saved.

- ### Jekyll is not involved

  Deploying the artifact through Actions serves your files exactly as built, so no `.nojekyll` file is needed and a folder beginning with an underscore is safe. That is only true on this path — deploying *from a branch* still runs Jekyll.
:::

{.tick}
***

{.eyebrow}
Making it yours

## A theme, and diagrams

::::columns{ratio="1:1"}
**Your own stylesheet.** Pass `--theme theme.css` and it is linked after the default one, so it can override any token and style any author class you invent. The [examples](../examples/index.html) are six documents that differ only in their theme; the source of each names no color and no width.

```sh
markset html docs/guide.md --css markset.css \
  --theme theme.css -o dist/guide.html
```

::col

**Diagrams cost nothing until they do.** An `ascii` fence in a captioned figure is drawn with no extra setup, in CI as anywhere else. Any other language needs an engine you name, and mermaid's brings a headless browser with it — which is exactly the download `--omit=dev` just saved you, so add it back deliberately or not at all. See [diagrams](../reference/diagrams/index.html).
::::

{.tick}
***

{.eyebrow}
Honest limits

## When you outgrow this

This recipe has no navigation, no index page generated from the others, and no search. That is not an oversight: **Markset is a document format, not a site generator**, and the moment you want those you are writing a generator, however small.

Two reasonable directions, neither of which is Markset's business:

:::steps
1. ### Write the twenty lines

   A loop that collects each document's first heading and writes an index is short, and you already have the parse result — `parseDocument` returns an AST that any unified tool can walk. That is how this site's own generator started.

2. ### Keep the generator you have

   If you already run Eleventy, Hugo, Astro or anything else, do not replace it. Render each page to a fragment with `--fragment` and hand it to your existing layout, or lower the constructs away entirely with `markset downgrade`. Those routes are on the [adoption page](../start/index.html).
:::

{.small .muted}
This site is built by `site/build.ts` in the Markset repository, which is the twenty lines above grown up: it adds navigation, a table of contents, generated reference pages and per-page themes. Read it if you want the next step after this page, but do not read it as the minimum — the minimum is the workflow above.
