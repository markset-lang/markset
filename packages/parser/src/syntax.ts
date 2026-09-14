/**
 * micromark syntax extension for the three Markset grammar constructs:
 * the block directive container (§2.3), the separator line (§2.4), and the
 * bracketed span (§2.2). Tokenizers only find boundaries; the fence line and
 * attribute specifier text are handed to the line grammar in directives.ts
 * and attributes.ts by the mdast compiler, so there is one grammar, not two.
 *
 * The container's content handling (document chunks, lazy lines, closing
 * fence detection) follows the structure of micromark-extension-directive
 * (MIT, Titus Wormer).
 */
import { factorySpace } from "micromark-factory-space";
import { asciiAlpha, markdownLineEnding, markdownSpace } from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code, Construct, Effects, Extension, State, Token, TokenizeContext,
} from "micromark-util-types";
import "./ast.ts";

export function markset(): Extension {
  return {
    flow: { [codes.colon]: [directiveContainer, separator] },
    text: { [codes.leftSquareBracket]: span },
  };
}

// ---------------------------------------------------------------------------
// Block directive container
// ---------------------------------------------------------------------------

const directiveContainer: Construct = { name: "marksetDirective", tokenize: tokenizeDirectiveContainer, concrete: true };
const restIsBlank: Construct = { tokenize: tokenizeRestIsBlank, partial: true };
const argumentIsTerminated: Construct = { tokenize: tokenizeArgumentIsTerminated, partial: true };
const nonLazyLine: Construct = { tokenize: tokenizeNonLazyLine, partial: true };

function isNameCode(code: Code): boolean {
  return code !== null && (
    (code >= codes.digit0 && code <= codes.digit9)
    || (code >= codes.uppercaseA && code <= codes.uppercaseZ)
    || (code >= codes.lowercaseA && code <= codes.lowercaseZ)
    || code === codes.underscore || code === codes.dash
  );
}

function tokenizeDirectiveContainer(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const self = this;
  const tail = self.events[self.events.length - 1];
  const initialSize = tail && tail[1].type === types.linePrefix
    ? tail[2].sliceSerialize(tail[1], true).length
    : 0;
  let sizeOpen = 0;
  let previous: Token | undefined;
  let argumentDepth = 0;

  return start;

  function start(code: Code): State | undefined {
    effects.enter("marksetDirective");
    effects.enter("marksetDirectiveFence");
    effects.enter("marksetDirectiveFenceSequence");
    return sequenceOpen(code);
  }

  function sequenceOpen(code: Code): State | undefined {
    if (code === codes.colon) {
      effects.consume(code);
      sizeOpen++;
      return sequenceOpen;
    }
    if (sizeOpen < 3) return nok(code);
    effects.exit("marksetDirectiveFenceSequence");
    // A fence with nothing after it is a closing fence. With no open directive
    // to close, it is ordinary text (and a DIRECTIVE_STRAY_FENCE warning later).
    return effects.check(restIsBlank, nok, afterSequence)(code);
  }

  function afterSequence(code: Code): State | undefined {
    if (isNameCode(code)) {
      effects.enter("marksetDirectiveName");
      return name(code);
    }
    return afterName(code);
  }

  function name(code: Code): State | undefined {
    if (isNameCode(code)) {
      effects.consume(code);
      return name;
    }
    effects.exit("marksetDirectiveName");
    return afterName(code);
  }

  function afterName(code: Code): State | undefined {
    if (code === codes.leftSquareBracket) {
      return effects.check(argumentIsTerminated, argumentStart, afterArgument)(code);
    }
    return afterArgument(code);
  }

  function argumentStart(code: Code): State | undefined {
    effects.enter("marksetDirectiveArgument");
    effects.enter("marksetDirectiveArgumentMarker");
    effects.consume(code);
    effects.exit("marksetDirectiveArgumentMarker");
    argumentDepth = 1;
    return argumentContentStart;
  }

  function argumentContentStart(code: Code): State | undefined {
    if (code === codes.rightSquareBracket) return argumentClose(code);
    effects.enter(types.chunkText, { contentType: constants.contentTypeText });
    return argumentInside(code);
  }

  function argumentInside(code: Code): State | undefined {
    if (code === codes.backslash) {
      effects.consume(code);
      return argumentEscape;
    }
    if (code === codes.leftSquareBracket) argumentDepth++;
    if (code === codes.rightSquareBracket && --argumentDepth === 0) {
      effects.exit(types.chunkText);
      return argumentClose(code);
    }
    effects.consume(code);
    return argumentInside;
  }

  function argumentEscape(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return argumentInside(code);
    effects.consume(code);
    return argumentInside;
  }

  function argumentClose(code: Code): State | undefined {
    effects.enter("marksetDirectiveArgumentMarker");
    effects.consume(code);
    effects.exit("marksetDirectiveArgumentMarker");
    effects.exit("marksetDirectiveArgument");
    return afterArgument;
  }

  /** Everything else on the line (attribute specifier, whitespace, trailing junk) is kept raw. */
  function afterArgument(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return fenceEnd(code);
    effects.enter("marksetDirectiveFenceRest");
    return rest(code);
  }

  function rest(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit("marksetDirectiveFenceRest");
      return fenceEnd(code);
    }
    effects.consume(code);
    return rest;
  }

  function fenceEnd(code: Code): State | undefined {
    effects.exit("marksetDirectiveFence");
    if (code === codes.eof) return afterOpening(code);
    // Interrupting a paragraph: micromark only needs to know the fence is valid.
    if (self.interrupt) return ok(code);
    return effects.attempt(nonLazyLine, contentStart, afterOpening)(code);
  }

  function afterOpening(code: Code): State | undefined {
    effects.exit("marksetDirective");
    return ok(code);
  }

  function contentStart(code: Code): State | undefined {
    if (code === codes.eof) return afterOpening(code);
    effects.enter("marksetDirectiveContent");
    return lineStart(code);
  }

  function lineStart(code: Code): State | undefined {
    if (code === codes.eof) return after(code);
    return effects.attempt(
      { tokenize: tokenizeClosingFence, partial: true },
      after,
      initialSize ? factorySpace(effects, chunkStart, types.linePrefix, initialSize + 1) : chunkStart,
    )(code);
  }

  function chunkStart(code: Code): State | undefined {
    if (code === codes.eof) return after(code);
    const token = effects.enter(types.chunkDocument, { contentType: constants.contentTypeDocument, previous });
    if (previous) previous.next = token;
    previous = token;
    return contentContinue(code);
  }

  function contentContinue(code: Code): State | undefined {
    if (code === codes.eof) {
      const token = effects.exit(types.chunkDocument);
      self.parser.lazy[token.start.line] = false;
      return after(code);
    }
    if (markdownLineEnding(code)) {
      return effects.check(nonLazyLine, nonLazyLineAfter, lineAfter)(code);
    }
    effects.consume(code);
    return contentContinue;
  }

  function nonLazyLineAfter(code: Code): State | undefined {
    effects.consume(code);
    const token = effects.exit(types.chunkDocument);
    self.parser.lazy[token.start.line] = false;
    return lineStart;
  }

  function lineAfter(code: Code): State | undefined {
    const token = effects.exit(types.chunkDocument);
    self.parser.lazy[token.start.line] = false;
    return after(code);
  }

  function after(code: Code): State | undefined {
    effects.exit("marksetDirectiveContent");
    effects.exit("marksetDirective");
    return ok(code);
  }

  function tokenizeClosingFence(effects: Effects, ok: State, nok: State): State {
    let size = 0;
    return factorySpace(effects, closingPrefixAfter, types.linePrefix, constants.tabSize);

    function closingPrefixAfter(code: Code): State | undefined {
      effects.enter("marksetDirectiveClosingFence");
      effects.enter("marksetDirectiveFenceSequence");
      return closingSequence(code);
    }

    function closingSequence(code: Code): State | undefined {
      if (code === codes.colon) {
        effects.consume(code);
        size++;
        return closingSequence;
      }
      if (size < sizeOpen) return nok(code);
      effects.exit("marksetDirectiveFenceSequence");
      return factorySpace(effects, closingSequenceEnd, types.whitespace)(code);
    }

    function closingSequenceEnd(code: Code): State | undefined {
      if (code === codes.eof || markdownLineEnding(code)) {
        effects.exit("marksetDirectiveClosingFence");
        return ok(code);
      }
      return nok(code);
    }
  }
}

/** Succeeds when only spaces and tabs remain before the line ends. */
function tokenizeRestIsBlank(effects: Effects, ok: State, nok: State): State {
  return check;
  function check(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return ok(code);
    if (markdownSpace(code)) {
      effects.consume(code);
      return check;
    }
    return nok(code);
  }
}

/** From a `[`, succeeds when a matching `]` (nesting and escapes honored) occurs before the line ends. */
function tokenizeArgumentIsTerminated(effects: Effects, ok: State, nok: State): State {
  let depth = 0;
  return inside;
  function inside(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    if (code === codes.backslash) {
      effects.consume(code);
      return escape;
    }
    if (code === codes.leftSquareBracket) depth++;
    if (code === codes.rightSquareBracket && --depth === 0) {
      effects.consume(code);
      return ok;
    }
    effects.consume(code);
    return inside;
  }
  function escape(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    effects.consume(code);
    return inside;
  }
}

function tokenizeNonLazyLine(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const self = this;
  return start;
  function start(code: Code): State | undefined {
    effects.enter(types.lineEnding);
    effects.consume(code);
    effects.exit(types.lineEnding);
    return lineStart;
  }
  function lineStart(code: Code): State | undefined {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
  }
}

// ---------------------------------------------------------------------------
// Separator line
// ---------------------------------------------------------------------------

const separator: Construct = { name: "marksetSeparator", tokenize: tokenizeSeparator };

function tokenizeSeparator(effects: Effects, ok: State, nok: State): State {
  return start;

  function start(code: Code): State | undefined {
    effects.enter("marksetSeparator");
    effects.enter("marksetSeparatorSequence");
    effects.consume(code);
    return second;
  }

  function second(code: Code): State | undefined {
    if (code !== codes.colon) return nok(code);
    effects.consume(code);
    effects.exit("marksetSeparatorSequence");
    return afterSequence;
  }

  /** Exactly two colons, then an identifier start. Anything else is ordinary text. */
  function afterSequence(code: Code): State | undefined {
    if (!asciiAlpha(code)) return nok(code);
    effects.enter("marksetSeparatorRest");
    return rest(code);
  }

  function rest(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit("marksetSeparatorRest");
      effects.exit("marksetSeparator");
      return ok(code);
    }
    effects.consume(code);
    return rest;
  }
}

// ---------------------------------------------------------------------------
// Bracketed span
// ---------------------------------------------------------------------------

const span: Construct = { name: "marksetSpan", tokenize: tokenizeSpan };
const spanLookahead: Construct = { tokenize: tokenizeSpanLookahead, partial: true };

function tokenizeSpan(effects: Effects, ok: State, nok: State): State {
  let depth = 0;
  let previous: Token | undefined;
  let quoted = false;
  let previousCode: Code = null;

  return start;

  function start(code: Code): State | undefined {
    // Only commit when `]{...}` actually follows; otherwise leave the `[` to links.
    return effects.check(spanLookahead, open, nok)(code);
  }

  function open(code: Code): State | undefined {
    effects.enter("marksetSpan");
    effects.enter("marksetSpanMarker");
    effects.consume(code);
    effects.exit("marksetSpanMarker");
    depth = 1;
    return textStart;
  }

  /** Start of the span text, or of a new line inside it. Chunks are only opened when there is text to hold. */
  function textStart(code: Code): State | undefined {
    if (code === codes.rightSquareBracket && depth === 1) return textClose(code);
    const token = effects.enter(types.chunkText, { contentType: constants.contentTypeText, previous });
    if (previous) previous.next = token;
    previous = token;
    return inside(code);
  }

  function inside(code: Code): State | undefined {
    if (code === codes.backslash) {
      effects.consume(code);
      return escape;
    }
    if (markdownLineEnding(code)) {
      // Linked chunks must be adjacent, so the line ending belongs to this chunk.
      effects.consume(code);
      effects.exit(types.chunkText);
      return textStart;
    }
    if (code === codes.leftSquareBracket) depth++;
    if (code === codes.rightSquareBracket && --depth === 0) {
      effects.exit(types.chunkText);
      return textClose(code);
    }
    effects.consume(code);
    return inside;
  }

  function escape(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return inside(code);
    effects.consume(code);
    return inside;
  }

  function textClose(code: Code): State | undefined {
    effects.enter("marksetSpanMarker");
    effects.consume(code);
    effects.exit("marksetSpanMarker");
    effects.enter("marksetSpanAttributes");
    return attributes;
  }

  /**
   * Raw `{...}`. Mirrors the §2.1 grammar just enough to find the end: a quoted
   * value starts only with `"` directly after `=`, and a `}` inside it does not
   * close the specifier.
   */
  function attributes(code: Code): State | undefined {
    if (quoted) {
      if (code === codes.backslash) {
        effects.consume(code);
        return attributesEscape;
      }
      if (code === codes.quotationMark) quoted = false;
      effects.consume(code);
      return attributes;
    }
    if (code === codes.rightCurlyBrace) {
      effects.consume(code);
      effects.exit("marksetSpanAttributes");
      effects.exit("marksetSpan");
      return ok;
    }
    if (code === codes.quotationMark && previousCode === codes.equalsTo) quoted = true;
    previousCode = code;
    effects.consume(code);
    return attributes;
  }

  function attributesEscape(code: Code): State | undefined {
    effects.consume(code);
    return attributes;
  }
}

/** Verifies `[...]{...}` shape without emitting tokens: balanced text, then attributes closed on the same line. */
function tokenizeSpanLookahead(effects: Effects, ok: State, nok: State): State {
  let depth = 0;
  let quoted = false;
  let previousCode: Code = null;
  return text;

  function text(code: Code): State | undefined {
    if (code === codes.eof) return nok(code);
    if (code === codes.backslash) {
      effects.consume(code);
      return textEscape;
    }
    if (code === codes.leftSquareBracket) depth++;
    if (code === codes.rightSquareBracket && --depth === 0) {
      effects.consume(code);
      return afterText;
    }
    effects.consume(code);
    return text;
  }

  function textEscape(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return text(code);
    effects.consume(code);
    return text;
  }

  function afterText(code: Code): State | undefined {
    if (code !== codes.leftCurlyBrace) return nok(code);
    effects.consume(code);
    return attributes;
  }

  function attributes(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    if (quoted) {
      if (code === codes.backslash) {
        effects.consume(code);
        return attributesEscape;
      }
      if (code === codes.quotationMark) quoted = false;
      effects.consume(code);
      return attributes;
    }
    if (code === codes.rightCurlyBrace) {
      effects.consume(code);
      return ok;
    }
    if (code === codes.quotationMark && previousCode === codes.equalsTo) quoted = true;
    previousCode = code;
    effects.consume(code);
    return attributes;
  }

  function attributesEscape(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    effects.consume(code);
    return attributes;
  }
}
