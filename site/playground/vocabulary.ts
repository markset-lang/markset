/**
 * What a reader is allowed to write, as data.
 *
 * The catalogue is assembled in site/build.ts and rendered into the page, because
 * both halves of it are already in the repository and neither should be retyped
 * here:
 *
 * - the list of names is the closed vocabulary itself (`BLOCK_DIRECTIVE_NAMES`
 *   in the parser), so the palette cannot offer a construct the parser rejects,
 *   nor omit one it accepts;
 * - each snippet is a case from `tests/`, usually the one named `canonical`, so
 *   every snippet is a document the conformance suite already runs. A snippet
 *   that stopped being valid would fail the suite before it reached a reader.
 *
 * The snippets are rendered into the page rather than bundled into the script,
 * so there is one copy of each: the browser reads the one it is displaying. This
 * file holds the shape both sides agree on, and the insertion rules, which are
 * pure and therefore testable without a browser.
 */

import type { Nodes, Root } from "mdast";

/** How a snippet joins the document it is inserted into. */
export type EntryKind =
  /** Its own block, with blank lines around it. */
  | "block"
  /** Dropped in at the cursor, inside a paragraph. */
  | "inline"
  /** Only ever at the very top of the document, and only once. */
  | "frontmatter";

export interface VocabularyEntry {
  /** Stable id, used by the buttons and by the tests. */
  id: string;
  /** What the button says. Usually the directive name, spelled as it is typed. */
  label: string;
  kind: EntryKind;
  /** One line on what it is for. The construct blurbs are the reference index's own. */
  blurb: string;
  /** Markset source, from the conformance suite. */
  snippet: string;
  /** The reference page for it, relative to the playground. */
  href: string;
}

export interface VocabularyGroup {
  title: string;
  /** Shown under the group's title in the Vocabulary tab; the bar has no room for it. */
  note: string;
  entries: VocabularyEntry[];
}

/**
 * Where an insertion goes, and what to select afterwards.
 *
 * Pure, so it can be tested without a browser -- the rules about blank lines
 * are the fiddly part, and getting them wrong produces a document that is
 * subtly invalid a paragraph away from where the reader clicked.
 */
export interface Insertion {
  text: string;
  /** Offsets of the inserted snippet in the new text, for selecting it. */
  start: number;
  end: number;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u;

/**
 * Where a new top-level block goes, given where the caret is.
 *
 * Read off the tree rather than counted in lines, and that is the whole point.
 * Line arithmetic cannot tell "the caret is on the first line of a card" from
 * "the caret is on a paragraph", so it inserts between a construct's fences and
 * produces a document that is broken several lines from where the reader
 * clicked. The tree knows what block the caret is in, so the answer is always
 * the end of that block: an insertion lands at the top level or not at all.
 *
 * It also fixes the sequence. Inserting leaves the snippet selected, so the
 * caret sits inside what was just added; the next insertion goes after it,
 * which is the order a reader building a document expects.
 */
export function blockBoundary(tree: Pick<Root, "children">, caret: number): number {
  let at = 0;
  for (const child of tree.children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    if (start > caret) break;
    at = end;
  }
  return at;
}

/**
 * Whether an inline snippet can go at the caret, or has to become its own block.
 *
 * "At the cursor" is the right rule for an inline run and the wrong one
 * wherever the caret is not in inline content -- and the tree already knows
 * exactly where that is, so the rule is one line: the deepest node containing
 * the caret has to be a text node.
 *
 * It was not one line at first, and the difference is worth recording. An
 * exclusion list (frontmatter, code fences) was written by thinking about it,
 * and the property test found two more the same afternoon: a caret in
 * `markset: 0` produced `markset: [Beta]{.badge}0`, and a caret on a `:::card`
 * fence line produced `:::[Beta]{.badge}card`. Both are inside a node, neither
 * is inside text. Asking the tree covers the cases nobody listed.
 */
export function inlineAllowed(tree: Pick<Root, "children">, caret: number): boolean {
  const deepest = (node: Nodes): Nodes | undefined => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || caret < start || caret > end) return undefined;
    if ("children" in node) {
      for (const child of node.children) {
        const found = deepest(child as Nodes);
        if (found) return found;
      }
    }
    return node;
  };
  for (const child of tree.children) {
    const found = deepest(child as Nodes);
    if (found) return found.type === "text";
  }
  return false;
}

/** How many newlines a string ends with, capped at two, which is all that matters here. */
function trailingBreaks(text: string): number {
  const match = /(?:\r?\n[ \t]*){1,2}$/u.exec(text);
  return match ? (match[0].match(/\n/gu) ?? []).length : 0;
}

/** And how many it begins with. */
function leadingBreaks(text: string): number {
  const match = /^(?:[ \t]*\r?\n){1,2}/u.exec(text);
  return match ? (match[0].match(/\n/gu) ?? []).length : 0;
}

export function insertInto(
  document: string,
  entry: Pick<VocabularyEntry, "kind" | "snippet">,
  caret: number,
  boundary: number,
  inline = true,
): Insertion {
  if (entry.kind === "frontmatter") {
    // Frontmatter is positional: §6 puts it at the very top or nowhere. A
    // document that already has some gets its existing block selected rather
    // than a second one appended, which would be invalid and would look like
    // the button had done nothing.
    const existing = FRONTMATTER.exec(document);
    if (existing) return { text: document, start: 0, end: existing[0].trimEnd().length };
    const snippet = entry.snippet.replace(/\n+$/u, "");
    return { text: `${snippet}\n\n${document.replace(/^\n+/u, "")}`, start: 0, end: snippet.length };
  }

  if (entry.kind === "inline" && inline) {
    // An inline run belongs where the reader is typing, not at a block edge.
    const before = document.slice(0, caret);
    const after = document.slice(caret);
    return { text: before + entry.snippet + after, start: caret, end: caret + entry.snippet.length };
  }

  const before = document.slice(0, boundary);
  const after = document.slice(boundary);
  const snippet = entry.snippet.replace(/\n+$/u, "");
  // A blank line on each side, and never more than one. Without it a directive
  // fence joins the paragraph above and the whole construct parses as text.
  const lead = before === "" ? "" : "\n".repeat(Math.max(0, 2 - trailingBreaks(before)));
  const tail = after === "" ? "\n" : "\n".repeat(Math.max(0, 2 - leadingBreaks(after)));
  const start = before.length + lead.length;
  return { text: `${before}${lead}${snippet}${tail}${after}`, start, end: start + snippet.length };
}

/** The eight constructs, in the order the reference lists them. The parser's closed vocabulary is the authority. */
export const CONSTRUCTS = ["callout", "card", "grid", "columns", "tabs", "steps", "metrics", "figure"] as const;
export type ConstructName = (typeof CONSTRUCTS)[number];

/** One line per construct. Printed by the reference index, the palette and the editor extension. */
export const BLURB: Record<ConstructName, string> = {
  callout: "GitHub-style alerts with optional title and fold.",
  card: "A titled surface around any content.",
  grid: "A list whose items become cards.",
  columns: "Side-by-side regions with an optional ratio.",
  tabs: "Headings become tab labels; no JavaScript.",
  steps: "A numbered procedure from an ordered list.",
  metrics: "Big numbers with deltas from a table.",
  figure: "An image, table, or code block with a caption.",
};

/**
 * The case to show for a section.
 *
 * `canonical` by default, because that is the suite's own word for the minimal
 * correct form. The exception is a case that points at a file: figure's
 * canonical one is an image, and inserting it would render a broken image in
 * the preview -- so a self-contained case from the same section is taken
 * instead. Derived rather than hardcoded, so a future section with the same
 * shape is handled without anyone noticing it needed to be. Shared by the
 * playground's palette and the editor extension's snippets, so the two cannot
 * offer different text for the same construct.
 */
export function selectSnippet(
  cases: ReadonlyArray<{ name?: string; valid: boolean; markset: string }>,
  section: string,
): string {
  const list = cases.filter((c) => c.valid);
  const selfContained = (markset: string): boolean => !/\]\((?!#)[^)]+\)/u.test(markset);
  const canonical = list.find((c) => c.name?.startsWith("canonical"));
  const chosen = canonical && selfContained(canonical.markset) ? canonical : list.find((c) => selfContained(c.markset));
  if (!chosen) throw new Error(`no self-contained case in tests/${section}.json`);
  return chosen.markset.replace(/\n+$/u, "");
}
