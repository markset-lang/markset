/**
 * Install the published packages into an empty project and use them, as a
 * consumer would. Everything else in the suite runs inside the workspace, where
 * a package's sibling is always the local copy; this is the one check that sees
 * what npm resolves.
 *
 *   node test/consumer/smoke.ts --packed              pack each package and install the tarballs
 *   node test/consumer/smoke.ts --registry <version>  install that version from the registry
 *
 * The release workflow runs --packed before it publishes and --registry after.
 * The registry mode would have caught tiptap 0.3.1, which asked for a parser
 * the registry answered with one that predated serializeDocument.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.release as string;
const PACKAGES = [...release.matchAll(/--workspace (@markset-lang\/[a-z-]+)/gu)].map((m) => m[1]);

/** What a consumer adds for the packages that have peers: remark's pair, TipTap's pair, and React for /react. */
const PEERS = [
  "unified@11",
  "remark-parse@11",
  "@tiptap/core@3",
  "@tiptap/pm@3",
  "@tiptap/react@3",
  "react@19",
  "react-dom@19",
];

const mode = process.argv[2];
const project = mkdtempSync(join(tmpdir(), "markset-consumer-"));
const run = (command: string, args: string[], cwd = project) =>
  execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

try {
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  let specs: string[];
  if (mode === "--packed") {
    const packs = join(project, "packs");
    mkdirSync(packs);
    run(
      "npm",
      ["pack", "--silent", ...PACKAGES.flatMap((name) => ["--workspace", name]), "--pack-destination", packs],
      root,
    );
    specs = readdirSync(packs).map((file) => join(packs, file));
  } else if (mode === "--registry" && process.argv[3]) {
    specs = PACKAGES.map((name) => `${name}@${process.argv[3]}`);
  } else {
    throw new Error("usage: smoke.ts --packed | --registry <version>");
  }
  // The registry can take minutes to answer for a version it has just
  // accepted, so an install right after publishing is retried rather than failed.
  for (let attempt = 1; ; attempt++) {
    try {
      run("npm", ["install", "--prefer-online", "--no-audit", "--no-fund", "--loglevel=error", ...specs, ...PEERS]);
      break;
    } catch (error) {
      if (mode !== "--registry" || attempt === 10) throw error;
      console.log(`consumer: the registry does not have every package yet; waiting (attempt ${attempt})`);
      execFileSync("sleep", ["30"]);
    }
  }
  copyFileSync(join(import.meta.dirname, "consumer.mjs"), join(project, "consumer.mjs"));
  process.stdout.write(run("node", ["consumer.mjs"]));
  // Again under the development condition, which is how a consumer's dev
  // server resolves every package, micromark's development build included.
  process.stdout.write(run("node", ["--conditions=development", "consumer.mjs"]));
} finally {
  rmSync(project, { recursive: true, force: true });
}
