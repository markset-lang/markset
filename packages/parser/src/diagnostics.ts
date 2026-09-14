export type Severity = "error" | "warning";

/**
 * A validation diagnostic. `start` and `end` are character offsets into the
 * source string handed to the parser, end-exclusive. Codes are UPPER_SNAKE
 * and prefixed with the spec area they belong to (spec §7).
 */
export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
