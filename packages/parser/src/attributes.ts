import type { Diagnostic } from "./diagnostics.ts";

/** Parsed attribute specifier (spec §2.1). All four fields are always present. */
export interface Attributes {
  type: "attributes";
  id: string | null;
  classes: string[];
  attrs: Record<string, string>;
}

export interface AttributeSpecifierResult {
  attributes: Attributes;
  /** Offset just past the closing `}`, or `source.length` when unterminated. */
  end: number;
  diagnostics: Diagnostic[];
}

/** Diagnostic codes for §2.1. The table in the spec is the normative list. */
export const AttrCode = {
  UNTERMINATED: "ATTR_UNTERMINATED",
  UNEXPECTED_CHAR: "ATTR_UNEXPECTED_CHAR",
  BAD_IDENTIFIER: "ATTR_BAD_IDENTIFIER",
  EXPECTED_EQUALS: "ATTR_EXPECTED_EQUALS",
  EMPTY_VALUE: "ATTR_EMPTY_VALUE",
  BAD_VALUE: "ATTR_BAD_VALUE",
  UNTERMINATED_QUOTE: "ATTR_UNTERMINATED_QUOTE",
  BAD_ESCAPE: "ATTR_BAD_ESCAPE",
  RESERVED_KEY: "ATTR_RESERVED_KEY",
} as const;

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;
const RESERVED_KEYS = new Set(["id", "class"]);

/**
 * Parse an attribute specifier beginning at `start`, which must point at `{`.
 * Returns null when there is no `{` at `start`, so callers can probe cheaply.
 *
 * Parsing is error-tolerant: a malformed item yields one diagnostic, the
 * parser skips to the next whitespace or `}`, and continues. The returned
 * attributes reflect every well-formed item.
 */
export function parseAttributeSpecifier(source: string, start = 0): AttributeSpecifierResult | null {
  if (source[start] !== "{") return null;

  const attributes: Attributes = { type: "attributes", id: null, classes: [], attrs: {} };
  const diagnostics: Diagnostic[] = [];
  const length = source.length;
  let pos = start + 1;

  const error = (code: string, message: string, from: number, to: number): void => {
    diagnostics.push({ code, severity: "error", message, start: from, end: Math.min(to, length) });
  };
  /** Advance past the rest of the current item: up to whitespace, `}`, or end. */
  const skipItem = (from: number): number => {
    let p = from;
    while (p < length && !isSpace(source[p]) && source[p] !== "}") p++;
    return p;
  };

  while (true) {
    while (pos < length && isSpace(source[pos])) pos++;

    if (pos >= length) {
      error(AttrCode.UNTERMINATED, "attribute specifier is missing its closing `}`", start, length);
      return { attributes, end: length, diagnostics };
    }

    const ch = source[pos];
    if (ch === "}") {
      return { attributes, end: pos + 1, diagnostics };
    }

    const itemStart = pos;

    // #id or .class
    if (ch === "#" || ch === ".") {
      const tokenEnd = skipItem(pos + 1);
      const name = source.slice(pos + 1, tokenEnd);
      if (!IDENTIFIER.test(name)) {
        const what = ch === "#" ? "id" : "class";
        const detail = name === "" ? `${what} name is empty` : `${what} name "${name}" is not an identifier`;
        error(AttrCode.BAD_IDENTIFIER, `${detail}; identifiers match [A-Za-z][A-Za-z0-9_-]*`, itemStart, tokenEnd);
      } else if (ch === "#") {
        attributes.id = name;
      } else {
        attributes.classes.push(name);
      }
      pos = tokenEnd;
      continue;
    }

    // key=value
    if (isIdentifierChar(ch)) {
      let keyEnd = pos;
      while (keyEnd < length && isIdentifierChar(source[keyEnd])) keyEnd++;
      const key = source.slice(pos, keyEnd);

      if (!IDENTIFIER.test(key)) {
        error(AttrCode.BAD_IDENTIFIER, `key "${key}" is not an identifier; identifiers match [A-Za-z][A-Za-z0-9_-]*`, itemStart, keyEnd);
        pos = skipItem(keyEnd);
        continue;
      }
      if (source[keyEnd] !== "=") {
        error(AttrCode.EXPECTED_EQUALS, `expected "=" after key "${key}"`, itemStart, keyEnd);
        pos = skipItem(keyEnd);
        continue;
      }

      const valueStart = keyEnd + 1;
      if (valueStart >= length || isSpace(source[valueStart]) || source[valueStart] === "}") {
        error(AttrCode.EMPTY_VALUE, `key "${key}" has no value; write ${key}="" for an empty string`, itemStart, valueStart);
        pos = valueStart;
        continue;
      }

      let value: string | null;
      if (source[valueStart] === '"') {
        const quoted = readQuoted(source, valueStart);
        pos = quoted.end;
        value = quoted.value;
        if (quoted.unterminated) {
          error(AttrCode.UNTERMINATED_QUOTE, `quoted value for "${key}" is missing its closing quote`, valueStart, length);
          // The quote swallowed the rest of the input, so the missing `}` is the same defect.
          return { attributes, end: length, diagnostics };
        }
        for (const escapeAt of quoted.badEscapes) {
          error(AttrCode.BAD_ESCAPE, `unknown escape in quoted value; only \\" and \\\\ are defined`, escapeAt, escapeAt + 2);
          value = null;
        }
        if (pos < length && !isSpace(source[pos]) && source[pos] !== "}") {
          const junkEnd = skipItem(pos);
          error(AttrCode.BAD_VALUE, `text follows the closing quote of the value for "${key}"`, pos, junkEnd);
          pos = junkEnd;
          value = null;
        }
      } else {
        const valueEnd = skipItem(valueStart);
        const raw = source.slice(valueStart, valueEnd);
        pos = valueEnd;
        if (raw.includes('"') || raw.includes("'")) {
          error(AttrCode.BAD_VALUE, `bare value for "${key}" contains a quote; wrap the value in double quotes`, valueStart, valueEnd);
          value = null;
        } else {
          value = raw;
        }
      }

      if (RESERVED_KEYS.has(key)) {
        error(AttrCode.RESERVED_KEY, `"${key}" is reserved; use ${key === "id" ? "#name" : ".name"} instead`, itemStart, keyEnd);
        continue;
      }
      if (value !== null) attributes.attrs[key] = value;
      continue;
    }

    error(AttrCode.UNEXPECTED_CHAR, `unexpected "${ch}"; expected #id, .class, or key=value`, pos, pos + 1);
    pos = skipItem(pos + 1);
  }
}

interface QuotedValue {
  value: string;
  /** Offset just past the closing quote, or `source.length` when unterminated. */
  end: number;
  unterminated: boolean;
  /** Offsets of backslashes that begin an undefined escape. */
  badEscapes: number[];
}

/** Read a double-quoted value starting at the opening quote. `}` is literal inside quotes. */
function readQuoted(source: string, openAt: number): QuotedValue {
  let value = "";
  const badEscapes: number[] = [];
  let p = openAt + 1;
  while (p < source.length) {
    const c = source[p];
    if (c === '"') {
      return { value, end: p + 1, unterminated: false, badEscapes };
    }
    if (c === "\\") {
      const next = source[p + 1];
      if (next === '"' || next === "\\") {
        value += next;
      } else {
        badEscapes.push(p);
      }
      p += 2;
      continue;
    }
    value += c;
    p++;
  }
  return { value, end: source.length, unterminated: true, badEscapes };
}

function isSpace(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function isIdentifierChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_-]/.test(c);
}
