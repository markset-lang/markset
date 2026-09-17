/**
 * The parts of the playground that are not the browser.
 *
 * Diagnostics arrive as byte offsets, and a reader needs a line and a column.
 * The command line already solves that in packages/cli, which cannot be
 * imported here because it reads files -- so this is a second copy, and a test
 * runs both over the same document and requires the same answers. A line number
 * that is right in the terminal and wrong in the browser is the kind of thing
 * nobody notices until they are already lost.
 */
import type { Diagnostic } from "@markset-lang/parser";

export interface LocatedDiagnostic extends Diagnostic {
  line: number;
  column: number;
}

/** Line and column, both one-based, for a zero-based offset into `source`. */
export function locate(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

export function locateAll(source: string, diagnostics: readonly Diagnostic[]): LocatedDiagnostic[] {
  return diagnostics.map((d) => ({ ...d, ...locate(source, d.start) }));
}

/**
 * A one-line summary of how a parse went, for the tab label and the empty state.
 *
 * Errors and warnings are counted apart because they mean different things: an
 * error is a document the closed vocabulary rejects, a warning is one it
 * accepts and doubts. Reporting "3 problems" would flatten that distinction at
 * exactly the moment a reader is deciding whether their document is broken.
 */
export function summarize(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  if (errors === 0 && warnings === 0) return "No problems";
  const parts: string[] = [];
  if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/**
 * Carry the document in the URL fragment, so a playground link is a bug report.
 *
 * The fragment and not the query string: a fragment is never sent to the
 * server, so pasting a link here does not put the document in anyone's access
 * log. base64url keeps it out of trouble in chat clients that treat "+" and "/"
 * as the end of a link.
 */
export function encodeDocument(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The inverse, returning null for anything that is not a fragment we wrote. */
export function decodeDocument(fragment: string): string | null {
  try {
    const base64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
