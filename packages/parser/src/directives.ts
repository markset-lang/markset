import { parseAttributeSpecifier, type Attributes } from "./attributes.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { BLOCK_DIRECTIVE_NAMES, SEPARATOR_NAMES } from "./vocabulary.ts";

export interface DirectiveOpen {
  type: "directive-open";
  /** Number of colons in the fence. */
  fence: number;
  /** Null only when the line is malformed (missing or bad name). */
  name: string | null;
  /** Raw source between the brackets, unparsed. Null when no argument is written. */
  argument: string | null;
  attributes: Attributes;
}

export interface DirectiveClose {
  type: "directive-close";
  fence: number;
}

export interface Separator {
  type: "separator";
  name: string;
  attributes: Attributes;
}

export type DirectiveLine = DirectiveOpen | DirectiveClose | Separator;

export interface DirectiveLineResult {
  line: DirectiveLine;
  diagnostics: Diagnostic[];
}

/** Diagnostic codes for §2.3 and §2.4. The tables in the spec are the normative list. */
export const DirectiveCode = {
  MISSING_NAME: "DIRECTIVE_MISSING_NAME",
  BAD_NAME: "DIRECTIVE_BAD_NAME",
  UNKNOWN_NAME: "DIRECTIVE_UNKNOWN_NAME",
  UNTERMINATED_ARGUMENT: "DIRECTIVE_UNTERMINATED_ARGUMENT",
  TRAILING_CONTENT: "DIRECTIVE_TRAILING_CONTENT",
} as const;

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MAX_INDENT = 3;

function emptyAttributes(): Attributes {
  return { type: "attributes", id: null, classes: [], attrs: {} };
}

/**
 * Classify one line of source (without its line ending) as an opening fence,
 * closing fence, or separator. Returns null when the line is ordinary text.
 * The caller is expected to have stripped any container prefixes (blockquote
 * markers, list indentation) first; this function only tolerates the 0-3
 * spaces of indentation CommonMark allows before a fence.
 */
export function parseDirectiveLine(line: string): DirectiveLineResult | null {
  let pos = 0;
  while (pos < line.length && pos < MAX_INDENT && line[pos] === " ") pos++;
  if (line[pos] !== ":") return null;

  let colonsEnd = pos;
  while (colonsEnd < line.length && line[colonsEnd] === ":") colonsEnd++;
  const fence = colonsEnd - pos;

  if (fence === 2) return parseSeparator(line, colonsEnd);
  if (fence < 2) return null;

  if (isBlank(line, colonsEnd)) {
    return { line: { type: "directive-close", fence }, diagnostics: [] };
  }
  return parseOpen(line, fence, colonsEnd);
}

function parseOpen(line: string, fence: number, nameStart: number): DirectiveLineResult {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, start: number, end: number): void => {
    diagnostics.push({ code, severity: "error", message, start, end });
  };

  let pos = nameStart;
  const { name, end: nameEnd } = readName(line, pos);
  pos = nameEnd;
  if (name === "") {
    error(DirectiveCode.MISSING_NAME, "directive fence has no name; anonymous fenced divs are not Markset", nameStart, nameStart);
  } else if (!IDENTIFIER.test(name)) {
    error(DirectiveCode.BAD_NAME, `"${name}" is not a valid directive name; names match [A-Za-z][A-Za-z0-9_-]*`, nameStart, nameEnd);
  } else if (!BLOCK_DIRECTIVE_NAMES.has(name)) {
    const hint = SEPARATOR_NAMES.has(name) ? `; "::${name}" is a separator, not a block directive` : "";
    error(DirectiveCode.UNKNOWN_NAME, `unknown directive "${name}"${hint}; expected one of ${[...BLOCK_DIRECTIVE_NAMES].join(", ")}`, nameStart, nameEnd);
  }
  const validName = name !== "" && IDENTIFIER.test(name) ? name : null;

  let argument: string | null = null;
  if (line[pos] === "[") {
    const closeAt = findClosingBracket(line, pos);
    if (closeAt === -1) {
      error(DirectiveCode.UNTERMINATED_ARGUMENT, "directive argument is missing its closing `]`", pos, line.length);
      return {
        line: { type: "directive-open", fence, name: validName, argument: line.slice(pos + 1), attributes: emptyAttributes() },
        diagnostics,
      };
    }
    argument = line.slice(pos + 1, closeAt);
    pos = closeAt + 1;
  }

  let attributes = emptyAttributes();
  if (line[pos] === "{") {
    const spec = parseAttributeSpecifier(line, pos)!;
    attributes = spec.attributes;
    diagnostics.push(...spec.diagnostics);
    pos = spec.end;
  }

  checkTrailing(line, pos, error);
  return { line: { type: "directive-open", fence, name: validName, argument, attributes }, diagnostics };
}

function parseSeparator(line: string, nameStart: number): DirectiveLineResult | null {
  const { name, end: nameEnd } = readName(line, nameStart);
  // `::` not followed by an identifier is ordinary text, not a malformed separator.
  if (!IDENTIFIER.test(name)) return null;

  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, start: number, end: number): void => {
    diagnostics.push({ code, severity: "error", message, start, end });
  };

  if (!SEPARATOR_NAMES.has(name)) {
    error(DirectiveCode.UNKNOWN_NAME, `unknown separator "${name}"; expected one of ${[...SEPARATOR_NAMES].join(", ")}`, nameStart, nameEnd);
  }

  let pos = nameEnd;
  let attributes = emptyAttributes();
  if (line[pos] === "{") {
    const spec = parseAttributeSpecifier(line, pos)!;
    attributes = spec.attributes;
    diagnostics.push(...spec.diagnostics);
    pos = spec.end;
  }

  checkTrailing(line, pos, error);
  return { line: { type: "separator", name, attributes }, diagnostics };
}

/** Read the maximal run of identifier characters starting at `start`. */
function readName(line: string, start: number): { name: string; end: number } {
  let end = start;
  while (end < line.length && /[A-Za-z0-9_-]/.test(line[end])) end++;
  return { name: line.slice(start, end), end };
}

/** Index of the `]` matching the `[` at `openAt`, honoring nesting and backslash escapes, or -1. */
function findClosingBracket(line: string, openAt: number): number {
  let depth = 0;
  for (let i = openAt; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}

function checkTrailing(line: string, pos: number, error: (code: string, message: string, start: number, end: number) => void): void {
  if (isBlank(line, pos)) return;
  let start = pos;
  while (start < line.length && (line[start] === " " || line[start] === "\t")) start++;
  const hint = line[start] === "[" || line[start] === "{"
    ? "; the argument and attribute specifier must follow the name with no whitespace"
    : "";
  error(DirectiveCode.TRAILING_CONTENT, `unexpected content after the directive${hint}`, start, line.length);
}

function isBlank(line: string, from: number): boolean {
  for (let i = from; i < line.length; i++) {
    if (line[i] !== " " && line[i] !== "\t") return false;
  }
  return true;
}
