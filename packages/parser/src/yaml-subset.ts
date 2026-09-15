/**
 * A small YAML reader for frontmatter: block maps, block and flow sequences,
 * scalars (quoted, numbers, booleans, null), literal and folded block
 * scalars, and comments. Anchors, tags, multi-document streams, and flow maps
 * are out of scope; a flow map is kept as its raw text. Frontmatter only needs
 * `markset` and `theme` (spec §6), and other keys are read but never
 * interpreted, so this stays small rather than pulling in a YAML dependency.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export interface YamlResult {
  value: { [key: string]: YamlValue };
  /** First problem encountered, or null. Parsing stops at the problem. */
  error: { message: string; line: number } | null;
}

interface Line {
  indent: number;
  text: string;
  number: number;
}

export function parseYamlSubset(source: string): YamlResult {
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    const stripped = stripComment(raw);
    if (stripped.trim() === "") return;
    const indent = stripped.length - stripped.trimStart().length;
    lines.push({ indent, text: stripped.trim(), number: index + 1 });
  });

  let pos = 0;
  try {
    const value = lines.length === 0 ? {} : parseBlock(lines[0].indent);
    if (pos < lines.length) throw new YamlError(`unexpected content`, lines[pos].number);
    if (Array.isArray(value) || typeof value !== "object" || value === null) {
      throw new YamlError("frontmatter must be a mapping", lines[0]?.number ?? 1);
    }
    return { value, error: null };
  } catch (error) {
    if (error instanceof YamlError) return { value: {}, error: { message: error.message, line: error.line } };
    throw error;
  }

  function parseBlock(indent: number): YamlValue {
    const line = lines[pos];
    if (line.text.startsWith("- ") || line.text === "-") return parseSequence(indent);
    return parseMap(indent);
  }

  function parseMap(indent: number): { [key: string]: YamlValue } {
    const map: { [key: string]: YamlValue } = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos];
      const match = /^("[^"]*"|'[^']*'|[^\s:#][^:]*?)\s*:(?:\s+(.*))?$/.exec(line.text);
      if (!match) throw new YamlError(`expected "key: value"`, line.number);
      const key = unquote(match[1]);
      const rest = match[2];
      pos++;
      if (rest === undefined) {
        // Nested block, or null when nothing deeper follows.
        map[key] = pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null;
      } else if (rest === "|" || rest === ">") {
        map[key] = parseBlockScalar(indent, rest === ">");
      } else {
        map[key] = parseScalar(rest, line.number);
        if (pos < lines.length && lines[pos].indent > indent)
          throw new YamlError("unexpected indentation", lines[pos].number);
      }
    }
    if (pos < lines.length && lines[pos].indent > indent)
      throw new YamlError("unexpected indentation", lines[pos].number);
    return map;
  }

  function parseSequence(indent: number): YamlValue[] {
    const list: YamlValue[] = [];
    while (
      pos < lines.length &&
      lines[pos].indent === indent &&
      (lines[pos].text.startsWith("- ") || lines[pos].text === "-")
    ) {
      const line = lines[pos];
      const rest = line.text === "-" ? "" : line.text.slice(2).trim();
      if (rest === "") {
        pos++;
        list.push(pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null);
      } else if (/^[^\s:#][^:]*?\s*:(\s|$)/.test(rest)) {
        // `- key: value` starts a map whose indent is the column after "- ".
        lines[pos] = { indent: indent + 2, text: rest, number: line.number };
        list.push(parseMap(indent + 2));
      } else {
        pos++;
        list.push(parseScalar(rest, line.number));
      }
    }
    return list;
  }

  function parseBlockScalar(indent: number, folded: boolean): string {
    const parts: string[] = [];
    while (pos < lines.length && lines[pos].indent > indent) parts.push(lines[pos++].text);
    return folded ? parts.join(" ") : parts.join("\n");
  }
}

function parseScalar(text: string, line: number): YamlValue {
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    return inner === "" ? [] : splitFlow(inner).map((item) => parseScalar(item.trim(), line));
  }
  if (text.startsWith("{")) return text;
  if (text.startsWith('"') || text.startsWith("'")) {
    if (text.length < 2 || text[text.length - 1] !== text[0]) throw new YamlError("unterminated quoted string", line);
    return unquote(text);
  }
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)) return Number(text);
  return text;
}

function splitFlow(text: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const c of text) {
    if (quote) {
      current += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (c === ",") {
      items.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  items.push(current);
  return items;
}

function unquote(text: string): string {
  if (text.startsWith('"')) {
    return text.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  }
  if (text.startsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

class YamlError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}
