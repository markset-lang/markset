import { test } from "node:test";
import assert from "node:assert/strict";
import { runSuite, suitePassed } from "../src/harness.ts";
import { formatReport } from "../src/report.ts";
import { drivers } from "../src/drivers.ts";

/**
 * Runs the real suite under tests/ so `npm test` covers conformance. Skipped
 * aspects (sections or renderers that do not exist yet) do not fail this test.
 */
test("tests/*.json conform to the schema and pass against the implementation", async () => {
  const result = await runSuite({ drivers });
  assert.ok(result.files.length > 0, "no conformance files found under tests/");
  assert.ok(suitePassed(result), `\n${formatReport(result)}`);
});
