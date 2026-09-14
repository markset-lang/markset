/** The closed v0 vocabulary (spec §2.3, §2.4, §4). Callouts use blockquote syntax and are not directives. */
export const BLOCK_DIRECTIVE_NAMES: ReadonlySet<string> = new Set([
  "card", "grid", "columns", "tabs", "steps", "metrics", "figure",
]);

export const SEPARATOR_NAMES: ReadonlySet<string> = new Set(["col"]);
