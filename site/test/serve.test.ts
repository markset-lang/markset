import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { contentType, injectClient, resolveRequest, WATCHED } from "../serve.ts";

const dist = resolve(import.meta.dirname, "..", "..", "dist");

test("media types cover what the site serves", () => {
  assert.equal(contentType("reference/index.html"), "text/html; charset=utf-8");
  assert.equal(contentType("css/markset.css"), "text/css; charset=utf-8");
  assert.equal(contentType("examples/showcase/degrade.SVG"), "image/svg+xml");
  assert.equal(contentType("unknown.bin"), "application/octet-stream");
});

test("the reload client goes in before </body> and only into HTML", () => {
  const html = injectClient("<html>\n<body>\n<p>x</p>\n</body>\n</html>\n");
  assert.ok(html.includes("EventSource"), html);
  assert.ok(html.indexOf("<script>") < html.indexOf("</body>"), html);
  assert.ok(html.endsWith("</body>\n</html>\n"), html);
  // A fragment with no body tag still gets the client, at the end.
  assert.ok(injectClient("<p>x</p>").startsWith("<p>x</p>"));
});

test("requests resolve inside dist and directories get index.html", () => {
  assert.equal(resolveRequest("/"), join(dist, "index.html"));
  assert.equal(resolveRequest("/reference/card/"), join(dist, "reference", "card", "index.html"));
  assert.equal(resolveRequest("/css/site.css?v=1"), join(dist, "css", "site.css"));
  assert.equal(resolveRequest("/../../etc/passwd"), join(dist, "etc", "passwd"));
  assert.equal(resolveRequest("/%ZZ"), null);
});

test("the dev server watches every source directory the site has", async () => {
  // A directory the build reads and the watcher does not is a change that never
  // appears until you restart. That is how site/playground/ arrived: the whole
  // application was invisible to site:watch, and the only symptom was an edit
  // that seemed to do nothing. Derived rather than listed, so the next one is
  // caught by the same rule.
  const root = resolve(import.meta.dirname, "..", "..");
  const entries = await readdir(join(root, "site"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "test") continue;
    assert.ok(WATCHED.includes(`site/${entry.name}`), `site/${entry.name} is built from but not watched`);
  }
  // And nothing in the list has been renamed out from under it.
  for (const target of WATCHED) {
    await readdir(join(root, target)).catch(async () => {
      const { stat } = await import("node:fs/promises");
      await stat(join(root, target));
    });
  }
});
