/**
 * Frontmatter (spec §6): the `markset` version key and the theme token
 * block. Everything else in the frontmatter is left to the document's owner.
 */
import type { Yaml } from "mdast";
import type { Diagnostic, Severity } from "./diagnostics.ts";
import { parseYamlSubset, type YamlValue } from "./yaml-subset.ts";

export const FrontmatterCode = {
  UNPARSEABLE: "FRONTMATTER_UNPARSEABLE",
  VERSION_UNSUPPORTED: "DOCUMENT_VERSION_UNSUPPORTED",
  THEME_UNKNOWN_TOKEN: "THEME_UNKNOWN_TOKEN",
  THEME_INVALID_TOKEN: "THEME_INVALID_TOKEN",
} as const;

export type Preset = "editorial" | "technical" | "deck" | "report";
export type Density = "compact" | "comfortable" | "spacious";
export type Radius = "none" | "sm" | "md" | "lg";

export interface Theme {
  preset: Preset | null;
  accent: string | null;
  density: Density | null;
  radius: Radius | null;
  type: { body: string | null; heading: string | null; scale: number | null };
}

export interface Frontmatter {
  /** The declared spec version, or null when `markset:` is absent. */
  markset: number | null;
  theme: Theme | null;
}

const PRESETS: readonly Preset[] = ["editorial", "technical", "deck", "report"];
const DENSITIES: readonly Density[] = ["compact", "comfortable", "spacious"];
const RADII: readonly Radius[] = ["none", "sm", "md", "lg"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Read the frontmatter node. `fenceOffset` is the document offset of the yaml node's opening `---`. */
export function readFrontmatter(node: Yaml, diagnostics: Diagnostic[]): Frontmatter {
  const valueStart = (node.position?.start.offset ?? 0) + 4; // past "---\n"
  const report = (code: string, severity: Severity, message: string, line?: number): void => {
    const span = line === undefined ? { start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0 } : lineSpan(node.value, line, valueStart);
    diagnostics.push({ code, severity, message, ...span });
  };

  const parsed = parseYamlSubset(node.value);
  if (parsed.error) {
    report(FrontmatterCode.UNPARSEABLE, "warning", `frontmatter could not be read: ${parsed.error.message}`, parsed.error.line);
    return { markset: null, theme: null };
  }
  const data = parsed.value;
  const lineOf = (key: string): number | undefined => findKeyLine(node.value, key);

  let markset: number | null = null;
  if ("markset" in data) {
    if (data.markset === 0) {
      markset = 0;
    } else {
      report(FrontmatterCode.VERSION_UNSUPPORTED, "error", `markset: ${JSON.stringify(data.markset)} is not a supported version; this parser implements 0`, lineOf("markset"));
    }
  }

  let theme: Theme | null = null;
  if ("theme" in data) {
    theme = { preset: null, accent: null, density: null, radius: null, type: { body: null, heading: null, scale: null } };
    const block = data.theme;
    if (!isMap(block)) {
      report(FrontmatterCode.THEME_INVALID_TOKEN, "error", "theme must be a mapping of tokens", lineOf("theme"));
    } else {
      for (const [key, value] of Object.entries(block)) {
        const line = lineOf(key);
        switch (key) {
          case "preset": theme.preset = oneOf(PRESETS, value, key, line); break;
          case "density": theme.density = oneOf(DENSITIES, value, key, line); break;
          case "radius": theme.radius = oneOf(RADII, value, key, line); break;
          case "accent":
            if (typeof value === "string" && HEX_COLOR.test(value)) theme.accent = value;
            else report(FrontmatterCode.THEME_INVALID_TOKEN, "error", `theme.accent must be a hex color like "#2563eb"`, line);
            break;
          case "type":
            if (!isMap(value)) {
              report(FrontmatterCode.THEME_INVALID_TOKEN, "error", "theme.type must be a mapping with body, heading, scale", line);
              break;
            }
            for (const [sub, subValue] of Object.entries(value)) {
              const subLine = lineOf(sub);
              if (sub === "body" || sub === "heading") {
                if (typeof subValue === "string" && subValue !== "") theme.type[sub] = subValue;
                else report(FrontmatterCode.THEME_INVALID_TOKEN, "error", `theme.type.${sub} must be a font family name`, subLine);
              } else if (sub === "scale") {
                if (typeof subValue === "number" && subValue >= 1 && subValue <= 2) theme.type.scale = subValue;
                else report(FrontmatterCode.THEME_INVALID_TOKEN, "error", "theme.type.scale must be a number from 1 to 2", subLine);
              } else {
                report(FrontmatterCode.THEME_UNKNOWN_TOKEN, "warning", `theme.type.${sub} is not a theme token; it is ignored`, subLine);
              }
            }
            break;
          default:
            report(FrontmatterCode.THEME_UNKNOWN_TOKEN, "warning", `theme.${key} is not a theme token; it is ignored`, line);
        }
      }
    }
  }

  return { markset, theme };

  function oneOf<V extends string>(values: readonly V[], value: YamlValue, key: string, line?: number): V | null {
    if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as V;
    report(FrontmatterCode.THEME_INVALID_TOKEN, "error", `theme.${key} must be one of ${values.join(", ")}`, line);
    return null;
  }
}

function isMap(value: YamlValue | undefined): value is { [key: string]: YamlValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findKeyLine(text: string, key: string): number | undefined {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*:`).test(line));
  return index === -1 ? undefined : index + 1;
}

function lineSpan(text: string, line: number, base: number): { start: number; end: number } {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  const content = lines[line - 1] ?? "";
  const leading = content.length - content.trimStart().length;
  return { start: base + offset + leading, end: base + offset + content.length };
}
