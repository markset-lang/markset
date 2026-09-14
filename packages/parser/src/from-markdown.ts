/**
 * mdast-util-from-markdown extension that turns the micromark tokens from
 * syntax.ts into `directive`, `separator`, and `span` nodes, running the
 * fence-line and attribute grammars on the token text and collecting their
 * diagnostics with document offsets.
 */
import type { Paragraph } from "mdast";
import type { CompileContext, Extension, Token } from "mdast-util-from-markdown";
import { parseAttributeSpecifier, type Attributes } from "./attributes.ts";
import { parseDirectiveLine, DirectiveCode } from "./directives.ts";
import type { Diagnostic } from "./diagnostics.ts";
import type { AttributeLine, Directive, SeparatorNode, Span } from "./ast.ts";

function emptyAttributes(): Attributes {
  return { type: "attributes", id: null, classes: [], attrs: {} };
}

export function marksetFromMarkdown(diagnostics: Diagnostic[]): Extension {
  const closed = new WeakSet<Directive>();

  const shifted = (list: Diagnostic[], token: Token): Diagnostic[] =>
    list.map((d) => ({ ...d, start: d.start + token.start.offset, end: d.end + token.start.offset }));

  function top<T>(context: CompileContext): T {
    return context.stack[context.stack.length - 1] as unknown as T;
  }

  function enterDirective(this: CompileContext, token: Token): undefined {
    const node: Directive = { type: "directive", name: null, argument: null, attributes: emptyAttributes(), children: [] };
    this.enter(node, token);
  }

  function enterArgument(this: CompileContext, token: Token): undefined {
    // Collect inline children in a scratch paragraph, moved to `argument` on exit.
    this.enter({ type: "paragraph", children: [] }, token);
  }

  function exitArgument(this: CompileContext, token: Token): undefined {
    const scratch = top<Paragraph>(this);
    this.exit(token);
    const directive = top<Directive>(this);
    directive.children.pop();
    directive.argument = scratch.children;
  }

  function exitFence(this: CompileContext, token: Token): undefined {
    const directive = top<Directive>(this);
    const result = parseDirectiveLine(this.sliceSerialize(token));
    if (!result || result.line.type !== "directive-open") {
      throw new Error(`fence token did not parse as an opening fence: ${JSON.stringify(this.sliceSerialize(token))}`);
    }
    directive.name = result.line.name;
    directive.attributes = result.line.attributes;
    diagnostics.push(...shifted(result.diagnostics, token));
  }

  function enterClosingFence(this: CompileContext): undefined {
    closed.add(top<Directive>(this));
  }

  function exitDirective(this: CompileContext, token: Token): undefined {
    const directive = top<Directive>(this);
    if (!closed.has(directive)) {
      const fenceEnd = token.start.offset + firstLineLength(this.sliceSerialize(token));
      diagnostics.push({
        code: DirectiveCode.UNCLOSED,
        severity: "warning",
        message: `directive "${directive.name ?? ""}" is not closed; it ends with the enclosing block`,
        start: token.start.offset,
        end: fenceEnd,
      });
    }
    this.exit(token);
  }

  function enterSeparator(this: CompileContext, token: Token): undefined {
    const node: SeparatorNode = { type: "separator", name: "", attributes: emptyAttributes() };
    this.enter(node, token);
  }

  function exitSeparator(this: CompileContext, token: Token): undefined {
    const node = top<SeparatorNode>(this);
    const result = parseDirectiveLine(this.sliceSerialize(token));
    if (!result || result.line.type !== "separator") {
      throw new Error(`separator token did not parse as a separator: ${JSON.stringify(this.sliceSerialize(token))}`);
    }
    node.name = result.line.name;
    node.attributes = result.line.attributes;
    diagnostics.push(...shifted(result.diagnostics, token));
    this.exit(token);
  }

  function enterSpan(this: CompileContext, token: Token): undefined {
    const node: Span = { type: "span", attributes: emptyAttributes(), children: [] };
    this.enter(node, token);
  }

  function exitSpanAttributes(this: CompileContext, token: Token): undefined {
    const node = top<Span>(this);
    const result = parseAttributeSpecifier(this.sliceSerialize(token), 0);
    if (!result) throw new Error("span attributes token did not begin with `{`");
    node.attributes = result.attributes;
    diagnostics.push(...shifted(result.diagnostics, token));
  }

  function exitSpan(this: CompileContext, token: Token): undefined {
    this.exit(token);
  }

  function enterAttributeLine(this: CompileContext, token: Token): undefined {
    const node: AttributeLine = { type: "attributeLine", attributes: emptyAttributes() };
    this.enter(node, token);
  }

  function exitAttributeLine(this: CompileContext, token: Token): undefined {
    const node = top<AttributeLine>(this);
    const result = parseAttributeSpecifier(this.sliceSerialize(token), 0);
    if (!result) throw new Error("attribute line token did not begin with `{`");
    node.attributes = result.attributes;
    diagnostics.push(...shifted(result.diagnostics, token));
    this.exit(token);
  }

  return {
    canContainEols: ["span"],
    enter: {
      marksetDirective: enterDirective,
      marksetDirectiveArgument: enterArgument,
      marksetDirectiveClosingFence: enterClosingFence,
      marksetSeparator: enterSeparator,
      marksetSpan: enterSpan,
      marksetAttributeLine: enterAttributeLine,
    },
    exit: {
      marksetDirective: exitDirective,
      marksetDirectiveArgument: exitArgument,
      marksetDirectiveFence: exitFence,
      marksetSeparator: exitSeparator,
      marksetSpan: exitSpan,
      marksetSpanAttributes: exitSpanAttributes,
      marksetAttributeLine: exitAttributeLine,
    },
  };
}

function firstLineLength(text: string): number {
  const index = text.search(/\r?\n/);
  return index === -1 ? text.length : index;
}
