/**
 * A remark plugin that teaches an existing unified pipeline to read Markset.
 *
 * Markset's parser is already micromark and mdast underneath, so this is
 * assembly rather than a second implementation: the same syntax extension, the
 * same mdast compiler extension, and the same normalization and validation
 * that `parseDocument` runs, arranged the way unified expects them.
 *
 * What it deliberately does not do is turn on anything the caller did not ask
 * for. `parseDocument` enables GFM tables and YAML frontmatter because a
 * Markset document may use both; a pipeline already has its own opinion about
 * those, so add `remark-gfm` and `remark-frontmatter` if you want them. This
 * plugin reads frontmatter when something else has parsed it into a `yaml`
 * node, and ignores its absence.
 */
import type { Nodes, Root } from "mdast";
// For the type augmentation alone: remark-parse is what declares
// micromarkExtensions and fromMarkdownExtensions on unified's Data. Every
// remark plugin that registers a syntax extension does this, remark-gfm
// included. Nothing is imported at runtime.
import type {} from "remark-parse";
import type { Plugin } from "unified";
import type { VFile } from "vfile";
import {
  type Attributes,
  attachAttributeLines,
  markset,
  marksetFromMarkdown,
  normalizeConstructs,
  readFrontmatter,
  validateStructure,
  type Diagnostic,
} from "@markset-lang/parser";

/** Diagnostics collected during parsing, parked on the tree until the transform runs. */
const CARRIED = "_marksetDiagnostics";

interface Carrier {
  [CARRIED]?: Diagnostic[];
}

const remarkMarkset: Plugin<[], Root, Root> = function remarkMarkset() {
  const data = this.data();
  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  const micromarkExtensions = data.micromarkExtensions;
  const fromMarkdownExtensions = data.fromMarkdownExtensions;

  // The mdast extension reports into an array, and it is built once while
  // parsing happens once per file. Handing it a long-lived array and reading
  // that array later would mix two files' diagnostics together the first time
  // anything processed two at once. A from-markdown transform runs
  // synchronously at the end of the parse that produced the tree, so moving
  // the diagnostics onto the tree there ties them to their own document and
  // leaves the array empty for the next one.
  const collected: Diagnostic[] = [];
  const extension = marksetFromMarkdown(collected);
  const transforms = [
    ...(extension.transforms ?? []),
    (tree: Root): undefined => {
      (tree as Root & Carrier)[CARRIED] = collected.splice(0);
      return undefined;
    },
  ];

  micromarkExtensions.push(markset());
  fromMarkdownExtensions.push({ ...extension, transforms });

  return (tree: Root, file: VFile): undefined => {
    const source = String(file);
    const carrier = tree as Root & Carrier;
    const diagnostics = carrier[CARRIED] ?? [];
    delete carrier[CARRIED];

    const first = tree.children[0];
    const meta = first?.type === "yaml" ? readFrontmatter(first, diagnostics) : null;
    if (meta) tree.frontmatter = meta;

    attachAttributeLines(tree, source, diagnostics);
    diagnostics.push(...validateStructure(tree, source));
    normalizeConstructs(tree, source, diagnostics);
    applyAttributes(tree);
    diagnostics.sort((a, b) => a.start - b.start || a.end - b.end);

    for (const d of diagnostics) {
      const message = file.message(d.message, { place: pointAt(source, d.start), ruleId: d.code, source: "markset" });
      // A vfile message is a warning unless it says otherwise, and Markset
      // draws that line itself: a document with an error is invalid (§7), so
      // the two severities must not collapse into one here.
      message.fatal = d.severity === "error";
    }
    return undefined;
  };
};

/**
 * Node types whose own to-hast handler reads `attributes` itself, so writing
 * hProperties for them would say the same thing twice. The list is the one in
 * render-html; a test renders the same document both ways and fails if the two
 * paths stop agreeing, which is what keeps this copy honest.
 */
const HANDLED = new Set([
  "callout",
  "card",
  "grid",
  "columns",
  "column",
  "tabs",
  "tab",
  "steps",
  "metrics",
  "figure",
  "span",
  "directive",
  "separator",
]);

/**
 * Lower §2.1 and §2.5 attributes onto `data.hProperties`, which is how mdast
 * carries them to any hast conversion. Doing it here rather than inside a
 * renderer is what makes an attribute line work with plain `remark-rehype`,
 * and with anything else downstream that reads mdast.
 */
function applyAttributes(tree: Root): void {
  const visit = (node: Nodes): void => {
    const attributes = (node as { attributes?: Attributes }).attributes;
    if (attributes && !HANDLED.has(node.type)) {
      const properties: Record<string, string | string[]> = {};
      if (attributes.id) properties.id = attributes.id;
      if (attributes.classes.length) properties.className = attributes.classes;
      for (const [key, value] of Object.entries(attributes.attrs)) properties[`data-${key}`] = value;
      node.data = {
        ...node.data,
        hProperties: { ...(node.data as { hProperties?: object } | undefined)?.hProperties, ...properties },
      };
    }
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(tree);
}

function pointAt(source: string, offset: number): { line: number; column: number; offset: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1, offset };
}

export default remarkMarkset;
export { remarkMarkset };
