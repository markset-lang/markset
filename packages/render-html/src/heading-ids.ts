import type { Nodes, Root } from "mdast";
import type { Attributes } from "@markset/parser";

/**
 * Slug for a heading: lowercased, with every run of characters that is not a
 * letter or a digit collapsed to a single hyphen. Letters and digits are taken
 * in the Unicode sense rather than the ASCII one, so a heading in a language
 * that is not English keeps its words instead of being reduced to "section".
 *
 * Emphasis and code markers are dropped before the rest, so "the `id` key" and
 * "the id key" produce the same slug.
 */
export function headingSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_~]/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "section"
  );
}

/**
 * Give every heading without an id one derived from its text, so the sections
 * of a rendered document can be linked. Returns a new tree.
 *
 * An explicit {#id} always wins: ids already in the tree are reserved before
 * any are generated, which also makes the pass idempotent. Collisions get a
 * numeric suffix in document order, so the first "Notes" keeps "notes" and the
 * second becomes "notes-2".
 *
 * Only heading nodes are touched. A card's title and a tab's label are inline
 * content on their construct rather than headings, so they are not linked; the
 * construct itself takes an id from its own specifier when one is wanted.
 */
export function addHeadingIds(tree: Root): Root {
  const clone = structuredClone(tree);
  const headings: Array<Nodes & { attributes?: Attributes }> = [];
  const taken = new Set<string>();

  const visit = (node: Nodes): void => {
    const id = (node as { attributes?: Attributes }).attributes?.id;
    if (id) taken.add(id);
    if (node.type === "heading") headings.push(node);
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(clone);

  for (const heading of headings) {
    if (heading.attributes?.id) continue;
    const base = headingSlug(text(heading));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    const current = heading.attributes;
    heading.attributes = current ? { ...current, id } : { type: "attributes", id, classes: [], attrs: {} };
  }
  return clone;
}

/** A node's text, as a reader would read it: literal values, skipping raw HTML. */
function text(node: Nodes): string {
  let out = "";
  const visit = (n: Nodes): void => {
    if (n.type === "html") return;
    if ("value" in n && typeof n.value === "string") out += n.value;
    if ("children" in n) for (const child of n.children) visit(child as Nodes);
  };
  visit(node);
  return out;
}
