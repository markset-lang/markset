import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { contentType, injectClient, resolveRequest } from "../serve.ts";

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
