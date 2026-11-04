/**
 * The default stylesheet, rewritten to reach only part of a page.
 *
 * markset.css styles `body`, `table`, `code` and the rest bare, because a
 * rendered page is all Markset. Where it is not, the VS Code preview (one page
 * for every Markdown file) or an application that shows a Markset document
 * inside its own interface, those bare rules would restyle everything else.
 * scopeStylesheet prefixes every selector with a scope, turns a selector that
 * starts with `body` into the scope itself, which is where the tokens `body`
 * carried go, and leaves one already starting with the scope alone.
 *
 * A prefix rather than `@scope`, for specificity: a host's own `.app table`
 * would beat a scoped bare `table`, and it ties with `.ms-document table`,
 * where the later stylesheet wins.
 *
 * `keep` and `bodyDeclarations` cut it down further: to the `.ms-` rules a host
 * application can take without Markset's typography, say, with only the tokens
 * from `body`. A rule left with no selector goes, and so does an at-rule left
 * with no rule.
 */

export interface ScopeOptions {
  /** The selector every rule is put under, and what `body` becomes. `.ms-document` by default. */
  scope?: string;
  /** Which selectors to keep, each asked as written in markset.css, before scoping. All by default. */
  keep?: (selector: string) => boolean;
  /** Which declarations of a rule for `body` to keep, by property name. All by default. */
  bodyDeclarations?: (property: string) => boolean;
}

interface Rule {
  kind: "rule";
  /** Whitespace before the selector list. */
  lead: string;
  selectors: string;
  declarations: string;
}

interface AtRule {
  kind: "at";
  /** Everything before the brace, as written. */
  prelude: string;
  children: Block[];
  /** What follows the last block inside the braces: declarations, for `@font-face`, or whitespace. */
  rest: string;
}

type Block = Rule | AtRule;

export function scopeStylesheet(css: string, options: ScopeOptions = {}): string {
  const scope = options.scope ?? ".ms-document";
  const text = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  let at = 0;

  function blocks(): { list: Block[]; rest: string } {
    const list: Block[] = [];
    let buffer = "";
    while (at < text.length) {
      const char = text[at++];
      if (char === "{") {
        const head = buffer.trim();
        if (head.startsWith("@")) {
          const inner = blocks();
          list.push({ kind: "at", prelude: buffer, children: inner.list, rest: inner.rest });
        } else {
          const close = text.indexOf("}", at);
          if (close === -1) throw new Error("scopeStylesheet: unbalanced braces");
          // Only the leading whitespace is kept: trim() also drops the trailing run
          // before the brace, and counting both once turned `body {` into `b.ms-document {`.
          list.push({
            kind: "rule",
            lead: /^\s*/u.exec(buffer)?.[0] ?? "",
            selectors: head,
            declarations: text.slice(at, close),
          });
          at = close + 1;
        }
        buffer = "";
      } else if (char === "}") {
        return { list, rest: buffer };
      } else {
        buffer += char;
      }
    }
    return { list, rest: buffer };
  }

  if (!balanced(text)) throw new Error("scopeStylesheet: unbalanced braces");
  const top = blocks();

  const isBody = (selector: string) => /^body(?![\w-])/u.test(selector);
  const scoped = (selector: string): string => {
    if (selector.startsWith(scope)) return selector;
    if (isBody(selector)) return `${scope}${selector.slice("body".length)}`;
    return `${scope} ${selector}`;
  };

  function write(list: Block[]): { css: string; rules: number; kept: number } {
    let out = "";
    let rules = 0;
    let kept = 0;
    for (const block of list) {
      if (block.kind === "at") {
        const inner = write(block.children);
        rules += inner.rules;
        kept += inner.kept;
        if (inner.rules > 0 && inner.kept === 0) continue;
        out += `${block.prelude}{${inner.css}${block.rest}}`;
        continue;
      }
      rules++;
      const selectors = splitSelectors(block.selectors)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && (options.keep?.(s) ?? true));
      if (selectors.length === 0) continue;
      let declarations = block.declarations;
      if (options.bodyDeclarations && selectors.every(isBody)) {
        const parts = declarations.split(";");
        const last = parts.pop() ?? "";
        const chosen = parts.filter((part) => options.bodyDeclarations!(part.split(":")[0].trim()));
        if (chosen.length === 0) continue;
        declarations = `${chosen.join(";")};${last}`;
      }
      kept++;
      out += `${block.lead}${selectors.map(scoped).join(", ")} {${declarations}}`;
    }
    return { css: out, rules, kept };
  }

  return write(top.list).css + top.rest;
}

/**
 * A selector list's selectors: split at its own commas, not those inside
 * `:is(h1, h2)` or `[data-x="a,b"]`, which belong to one selector.
 */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of list) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
    } else if (char === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "{") depth++;
    else if (char === "}" && --depth < 0) return false;
  }
  return depth === 0;
}
