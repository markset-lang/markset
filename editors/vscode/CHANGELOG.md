# Changelog

## 0.3.2 — 2026-09-17

The README the marketplace shows began with three stray settings rows ahead of its title, an editing slip in 0.3.1. Fixed, with a test that the README starts with its title. The listing now leads with what a reader gets, the preview rendering their document, rather than with the checker. No change to the extension itself.

## 0.3.1 — 2026-09-17

First release. Diagnostics for documents that declare `markset:` in frontmatter, a live preview with scripting off, a command that shows the plain CommonMark form, completions after `:::` and `> [!`, snippets derived from the conformance suite, and highlighting for fences, attribute lines, spans and callout markers.

The built-in Markdown preview renders Markset documents through `markdown.markdownItPlugins`, so the standard preview icon shows the real rendering; a `Markset` status bar item opens the extension's own preview. The icon: three dots over two lines, a fence over a card.

`markset.diagrams` names a command per diagram language, as the CLI's `--diagram` does, run asynchronously and cached; without one for `mermaid`, the built-in preview hands mermaid fences to the Markdown Preview Mermaid Support extension when it is installed.
