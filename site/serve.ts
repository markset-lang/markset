/**
 * Development server for the documentation site. Serves dist/, rebuilds when a
 * source file changes, and pushes a reload to every open browser. Node
 * built-ins only, so there is still nothing to install.
 *
 *   npm run site:watch -- --port 4000
 *
 * The reload client is injected into HTML as it is served and is never written
 * to disk, so dist/ stays byte-identical to what pages.yml deploys. A change to
 * a stylesheet swaps the <link> instead of reloading, which keeps the scroll
 * position while you iterate on spacing.
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "dist");

/**
 * Watched for changes, relative to the repository root. Everything the build
 * reads: its own source, the site content, the documents it renders, the
 * conformance cases the guide is generated from, and the packages that do the
 * rendering.
 */
export const WATCHED = [
  "site/build.ts",
  "site/deps.ts",
  "site/site.css",
  "site/content",
  "site/playground",
  "examples",
  "spec",
  "tests",
  "packages/parser/src",
  "packages/render-downgrade/src",
  "packages/render-html/src",
  "packages/render-html/css",
];

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/** Media type for a served path; unknown extensions download rather than render. */
export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** The reload client. Kept small and dependency-free; it only listens and acts. */
const CLIENT = `<script>
(() => {
  const KEY = "markset-dev-scroll";
  try {
    const y = sessionStorage.getItem(KEY);
    if (y !== null) {
      sessionStorage.removeItem(KEY);
      addEventListener("load", () => scrollTo(0, Number(y)));
    }
  } catch {}
  const source = new EventSource("/__reload");
  source.addEventListener("css", () => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const fresh = link.cloneNode();
      const url = new URL(link.href);
      url.searchParams.set("v", String(Date.now()));
      fresh.href = url.href;
      fresh.addEventListener("load", () => link.remove(), { once: true });
      link.parentNode.insertBefore(fresh, link.nextSibling);
    }
  });
  source.addEventListener("full", () => {
    try { sessionStorage.setItem(KEY, String(scrollY)); } catch {}
    location.reload();
  });
})();
</script>
`;

/** Put the reload client just before </body>, or at the end when there is no body tag. */
export function injectClient(html: string): string {
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + CLIENT : html.slice(0, at) + CLIENT + html.slice(at);
}

/**
 * Resolve a request path to a file inside dist/. Directory paths get index.html.
 * Returns null for anything that would escape the output directory.
 */
export function resolveRequest(urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = join(out, normalize(rel));
  if (file !== out && !file.startsWith(out + sep)) return null;
  return file;
}

const clients = new Set<ServerResponse>();

function subscribe(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(": connected\n\n");
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

function notify(event: string): void {
  for (const res of clients) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  if (url.split("?")[0] === "/__reload") {
    subscribe(res);
    return;
  }
  let file = resolveRequest(url);
  if (file === null) {
    res.writeHead(403).end("forbidden\n");
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    const type = contentType(file);
    const payload = type.startsWith("text/html") ? Buffer.from(injectClient(body.toString("utf8"))) : body;
    res.writeHead(200, { "content-type": type, "cache-control": "no-store", "content-length": payload.byteLength });
    res.end(payload);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`not found: ${url}\n`);
  }
}

/**
 * Run the build in a child process rather than calling build() here: Node
 * caches modules, so an in-process rebuild would keep serving the parser as it
 * was when this server started.
 *
 * The child needs `--conditions=markset-source` of its own. Without it the
 * workspace packages resolve through their published `exports` to `dist/`, and
 * the server renders the site with whatever was last compiled instead of what
 * is on disk — silently, because a stale `dist/` is a working build. It cost an
 * afternoon: charts had landed, every test passed, and the page in the browser
 * had none, because `packages/render-html/dist` predated them. `process.execArgv`
 * is not enough on its own, since it is empty when the flag came from an npm
 * script rather than the command line.
 */
function rebuild(): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--conditions=markset-source", join(root, "site", "build.ts")], {
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) process.stderr.write(`site: build failed\n${stderr}`);
      done(code === 0);
    });
  });
}

function startWatching(): void {
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let queued = false;

  const flush = async (): Promise<void> => {
    if (building) {
      queued = true;
      return;
    }
    const changed = [...pending];
    pending = new Set();
    if (changed.length === 0) return;
    building = true;
    const ok = await rebuild();
    building = false;
    if (ok) {
      const cssOnly = changed.every((file) => file.endsWith(".css"));
      notify(cssOnly ? "css" : "full");
      process.stdout.write(`site: ${cssOnly ? "styles swapped" : "reloaded"} after ${changed.length} change(s)\n`);
    }
    if (queued) {
      queued = false;
      await flush();
    }
  };

  const onChange = (file: string | null): void => {
    if (!file) return;
    const name = file.split(/[\\/]/).pop() ?? file;
    // Editors write temporary siblings while saving; they are not sources.
    if (name.startsWith(".") || name.endsWith("~") || /^\d+$/.test(name)) return;
    pending.add(file);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 50);
  };

  for (const target of WATCHED) {
    try {
      watch(join(root, target), { recursive: true }, (_event, file) => onChange(file ?? target));
    } catch (error) {
      process.stderr.write(`site: cannot watch ${target}: ${(error as Error).message}\n`);
    }
  }
}

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { port: { type: "string", default: "3000" } } });
  const port = Number(values.port);
  process.stdout.write("site: building\n");
  if (!(await rebuild())) process.exitCode = 1;
  startWatching();
  createServer((req, res) => {
    void handle(req, res);
  }).listen(port, () => {
    process.stdout.write(`site: http://localhost:${port} — watching for changes\n`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main(process.argv.slice(2));
}
