---
markset: 0
theme:
  preset: technical
  accent: "#2563eb"
---

{.eyebrow}
Why Markset

# Why it exists, and what it is not

{.lead}
A closed set of layout constructs on top of CommonMark, because Markdown has no way to say "these three things belong side by side", and every existing answer either reaches for raw HTML or executes code.

## Two things I did not want to give up

Documents rendered as Claude artifacts were the best-looking documents I had ever had produced for me, with cards, metric strips, columns and tabs where they helped. They were also HTML: hard to edit, harder to review in a diff, and impossible to carry anywhere else. Markdown is the opposite. It is plain text, it diffs, it renders everywhere, and it has no way to say "these three things belong side by side." I wanted to keep writing Markdown and be able to say that. The [example documents](../examples/index.html) on this site were all artifacts first, rebuilt in Markset to find out whether a closed vocabulary could carry them. It could, and where it could not, the specification changed.

**Markdown has no attributes and no generic container.** So rich documents reach for raw HTML, and that breaks portability, validation, and every output target that is not a browser. Pandoc, djot, Quarto, MyST, Markdoc and MDX each solved some of the *syntax*. None of them produced a set of components that independent renderers can agree on. That set is what Markset is.

:::grid{cols=3}
- ### Semantic, never presentational

  Authors name what a thing *is*, not how it looks. Whether a card has a border is decided by the theme: a handful of named settings in the document's frontmatter, such as a preset, an accent color and a density. No inline CSS and no pixel values in source.

- ### Every construct degrades

  Each one wraps an ordinary CommonMark block and has a defined fallback. Paste a Markset file into a GitHub comment and it still reads, top to bottom, with nothing lost.

- ### Closed vocabulary

  There are eight constructs and there will not quietly be a ninth. An unknown directive is a reported error, not silent passthrough, so a document can be checked before it ships.
:::

> [!NOTE]
> **Nothing here executes.** Interactivity is out of scope for the core specification, permanently. Tabs switch with radio inputs, callouts fold with `<details>`, and a document is data rather than code. That is what lets the same file render safely anywhere.

{.tick}
***

{.eyebrow}
Prior art

## Reuse, don't invent

The syntax is the convergent one. Attribute specifiers `{#id .class key=value}`, fenced directives `:::name` and bracketed spans `[text]{.class}` already exist across Pandoc, djot, MyST and remark-directive, and callouts use GitHub's `> [!NOTE]` unchanged. Nothing here is a new spelling of an old idea. What is new is the closed set of constructs on top, and the rule that every one of them has a defined plain-CommonMark form.

{.compare}
| Project | Attributes | Generic container | Portable component vocabulary | Document stays inert |
|---|---|---|---|---|
| Pandoc | `{#id .class}` | fenced divs | [None]{.badge} | [Yes]{.badge .success} |
| djot | native | native divs | [None]{.badge} | [Yes]{.badge .success} |
| Quarto | `{.class}` | fenced divs | [Product-specific]{.badge .warn} | [Executes code]{.badge .danger} |
| MyST | directives | directives | [Open and extensible]{.badge .warn} | [Executes code]{.badge .danger} |
| Markdoc | typed tags | typed tags | [Defined per project]{.badge .warn} | [Yes]{.badge .success} |
| MDX | JSX props | JSX | [Your components]{.badge .danger} | [Executes code]{.badge .danger} |
| **Markset** | `{#id .class}` | `:::name` | [Closed and portable]{.badge .success} | [Yes]{.badge .success} |

{.small .muted}
"Portable" means another implementation can render the same document from the specification alone. "Inert" means nothing in a document is evaluated in order to render it.
