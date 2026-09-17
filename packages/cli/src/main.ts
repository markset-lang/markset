import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { parseDocument, type Diagnostic } from "@markset-lang/parser";
import { renderDowngrade } from "@markset-lang/render-downgrade";
import {
  builtInEngines,
  defaultStylesheetPath,
  renderHtml,
  renderPage,
  type DiagramEngine,
  type DiagramOptions,
} from "@markset-lang/render-html";

const USAGE = `usage: markset <command> [options] <file>

commands
  check <file...>        report diagnostics; exit 1 when any is an error
  html <file>            render HTML (a full page with the default stylesheet inlined)
  downgrade <file>       render plain CommonMark
  ast <file>             print the AST as JSON
  css                    write the default stylesheet, for a site that links it once

options
  -o, --out <path>       write output to a file instead of stdout
  --fragment             html: emit only the body fragment
  --css <mode>           html: inline (default) | none | <href to link>
  --theme <file>         html: append a theme stylesheet after the default (spec §6)
  --diagram <spec>       html: diagram fences (spec §10); repeatable
                           ascii fences are drawn by default
                           none             draw nothing; keep every fence as code
                           <lang>=<command> run a command: fence on stdin, SVG on stdout
  --title <text>         html: page title (default: first level-one heading)
  --json                 check: emit diagnostics as JSON
  --positions            ast: keep position fields
  -h, --help             show this help

"-" reads the document from stdin.`;

/** Every command name, so an unknown one is reported as one rather than as a missing file. */
const COMMANDS = new Set(["check", "html", "downgrade", "ast", "css"]);

export async function main(
  argv: string[],
  io: { stdout: (s: string) => void; stderr: (s: string) => void },
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      fragment: { type: "boolean", default: false },
      css: { type: "string", default: "inline" },
      theme: { type: "string" },
      diagram: { type: "string", multiple: true },
      title: { type: "string" },
      json: { type: "boolean", default: false },
      positions: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...files] = positionals;
  if (values.help || !command) {
    io.stdout(`${USAGE}\n`);
    return values.help ? 0 : 2;
  }
  // Check the command before asking for a file, or a typo in the command is
  // reported as a missing argument: "markset htlm" used to answer "a file is
  // required", which sends the reader looking in the wrong place entirely.
  if (!COMMANDS.has(command)) {
    io.stderr(`markset: unknown command "${command}"\n\n${USAGE}\n`);
    return 2;
  }
  if (files.length === 0 && command !== "css") {
    io.stderr(`markset ${command}: a file is required ("-" for stdin)\n`);
    return 2;
  }

  const emit = async (text: string): Promise<void> => {
    if (values.out) await writeFile(values.out, text);
    else io.stdout(text);
  };

  switch (command) {
    case "check": {
      let errors = 0;
      const report: Array<Diagnostic & { file: string; line: number; column: number }> = [];
      for (const file of files) {
        const source = await read(file);
        const { diagnostics } = parseDocument(source);
        for (const d of diagnostics) {
          const { line, column } = position(source, d.start);
          report.push({ ...d, file, line, column });
          if (d.severity === "error") errors++;
        }
      }
      if (values.json) {
        await emit(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        for (const d of report) io.stdout(`${d.file}:${d.line}:${d.column}: ${d.severity} ${d.code} ${d.message}\n`);
        const summary = `${report.length} diagnostic(s), ${errors} error(s) in ${files.length} file(s)`;
        io.stderr(`${summary}\n`);
      }
      return errors > 0 ? 1 : 0;
    }
    case "html": {
      const source = await read(files[0]);
      const { ast, diagnostics } = parseDocument(source);
      warn(diagnostics, source, files[0], io);
      const choice = diagramOptions(values.diagram, io);
      if (!choice.ok) return 2;
      const diagrams = choice.diagrams;
      if (values.fragment) {
        await emit(renderHtml(ast, { diagrams }));
      } else {
        const stylesheet =
          values.css === "none"
            ? undefined
            : values.css === "inline"
              ? { inline: await readFile(defaultStylesheetPath, "utf8") }
              : { href: values.css };
        const theme = values.theme ? { inline: await readFile(values.theme, "utf8") } : undefined;
        await emit(renderPage(ast, { title: values.title, stylesheet, theme, diagrams }));
      }
      return 0;
    }
    case "css": {
      // A site that renders more than one page wants the stylesheet linked
      // once rather than inlined into every file, and it should not have to
      // know a path inside the package to get it. Writing the Pages recipe is
      // what made that obvious: --css already took an href, and there was no
      // way to produce the file it pointed at.
      await emit(await readFile(defaultStylesheetPath, "utf8"));
      return 0;
    }
    case "downgrade": {
      const source = await read(files[0]);
      const { ast, diagnostics } = parseDocument(source);
      warn(diagnostics, source, files[0], io);
      await emit(renderDowngrade(ast));
      return 0;
    }
    case "ast": {
      const source = await read(files[0]);
      const { ast, diagnostics } = parseDocument(source);
      warn(diagnostics, source, files[0], io);
      const tree = values.positions
        ? ast
        : JSON.parse(JSON.stringify(ast, (key, value) => (key === "position" ? undefined : value)));
      await emit(`${JSON.stringify(tree, null, 2)}\n`);
      return 0;
    }
    default:
      io.stderr(`markset: unknown command "${command}"\n\n${USAGE}\n`);
      return 2;
  }
}

/** Either the render option to use, or a usage error already reported. */
export type DiagramChoice = { ok: true; diagrams: DiagramOptions | false } | { ok: false };

/**
 * Build the --diagram option.
 *
 * Drawing is on by default, so no flag at all still draws `ascii` fences; the
 * flag adds a language, or turns drawing off entirely with `none`.
 *
 * The one property worth stating plainly: a document never names its engine.
 * The mapping from info string to command comes from this flag and nowhere
 * else, and the fence's contents reach the command on stdin rather than being
 * interpolated into it. So a Markset file cannot cause anything to run, which
 * is the part of invariant 4 that matters — the operator opting into a build
 * step is the same choice they already made by running markset at all.
 */
export function diagramOptions(specs: string[] | undefined, io: { stderr: (s: string) => void }): DiagramChoice {
  const onError = (error: Error, language: string): void =>
    io.stderr(`markset: diagram ${language}: ${error.message}\n`);
  // Engines layer over the built-ins, so naming one language never silently
  // removes another. An empty set still means "the built-ins", not "none".
  const engines: Record<string, DiagramEngine> = {};
  for (const spec of specs ?? []) {
    if (spec === "none") return { ok: true, diagrams: false };
    const split = spec.indexOf("=");
    const language = split === -1 ? spec : spec.slice(0, split);
    if (language === "") {
      io.stderr(`markset: --diagram "${spec}": a language is required\n`);
      return { ok: false };
    }
    if (split === -1) {
      if (!builtInEngines[language]) {
        const known = Object.keys(builtInEngines).join(", ");
        io.stderr(`markset: --diagram ${language}: no built-in engine (have: ${known}); use ${language}=<command>\n`);
        return { ok: false };
      }
      continue;
    }
    engines[language] = commandEngine(spec.slice(split + 1));
  }
  return { ok: true, diagrams: { engines, onError } };
}

/**
 * Run a command to draw one fence. Throwing is the documented way to decline
 * (§10 obligation 5), so a command that fails leaves the code block in place
 * and the document keeps its content.
 */
function commandEngine(command: string): DiagramEngine {
  return (source) => {
    const result = spawnSync(command, { shell: true, input: source, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    // The exit status comes first, before any spawn error. A command that
    // rejects a fence without reading it -- which is the normal shape of
    // failing fast -- exits while we are still writing to its stdin, so the
    // write fails with EPIPE and spawnSync reports that in preference to the
    // status it also has. Which one surfaces depends on whether the fence fit
    // the pipe buffer first, so the same command can report two different
    // things on two machines, and "EPIPE" is the one that tells the operator
    // nothing about their engine.
    if (typeof result.status === "number" && result.status !== 0) {
      const detail = result.stderr?.trim().split("\n")[0] ?? "";
      throw new Error(`"${command}" exited ${result.status}${detail ? `: ${detail}` : ""}`);
    }
    if (result.error) throw result.error;
    return result.stdout;
  };
}

async function read(file: string): Promise<string> {
  if (file === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(file, "utf8");
}

function warn(diagnostics: Diagnostic[], source: string, file: string, io: { stderr: (s: string) => void }): void {
  for (const d of diagnostics) {
    const { line, column } = position(source, d.start);
    io.stderr(`${file}:${line}:${column}: ${d.severity} ${d.code} ${d.message}\n`);
  }
}

export function position(source: string, offset: number): { line: number; column: number } {
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
