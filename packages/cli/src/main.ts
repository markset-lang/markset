import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseDocument, type Diagnostic } from "@markset/parser";
import { renderDowngrade } from "@markset/render-downgrade";
import { defaultStylesheetPath, renderHtml, renderPage } from "@markset/render-html";

const USAGE = `usage: markset <command> [options] <file>

commands
  check <file...>        report diagnostics; exit 1 when any is an error
  html <file>            render HTML (a full page with the default stylesheet inlined)
  downgrade <file>       render plain CommonMark
  ast <file>             print the AST as JSON

options
  -o, --out <path>       write output to a file instead of stdout
  --fragment             html: emit only the body fragment
  --css <mode>           html: inline (default) | none | <href to link>
  --theme <file>         html: append a theme stylesheet after the default (spec §6)
  --title <text>         html: page title (default: first level-one heading)
  --json                 check: emit diagnostics as JSON
  --positions            ast: keep position fields
  -h, --help             show this help

"-" reads the document from stdin.`;

export async function main(argv: string[], io: { stdout: (s: string) => void; stderr: (s: string) => void }): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      fragment: { type: "boolean", default: false },
      css: { type: "string", default: "inline" },
      theme: { type: "string" },
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
  if (files.length === 0) {
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
      if (values.fragment) {
        await emit(renderHtml(ast));
      } else {
        const stylesheet = values.css === "none" ? undefined
          : values.css === "inline" ? { inline: await readFile(defaultStylesheetPath, "utf8") }
            : { href: values.css };
        const theme = values.theme ? { inline: await readFile(values.theme, "utf8") } : undefined;
        await emit(renderPage(ast, { title: values.title, stylesheet, theme }));
      }
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
      const tree = values.positions ? ast : JSON.parse(JSON.stringify(ast, (key, value) => (key === "position" ? undefined : value)));
      await emit(`${JSON.stringify(tree, null, 2)}\n`);
      return 0;
    }
    default:
      io.stderr(`markset: unknown command "${command}"\n\n${USAGE}\n`);
      return 2;
  }
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
