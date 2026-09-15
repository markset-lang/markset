import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCase, runCase, runSuite, suitePassed } from "../src/harness.ts";
import type { ConformanceCase, Driver } from "../src/types.ts";

const base: ConformanceCase = { section: "x", markset: "{}", valid: true, ast: { a: 1 } };

function statuses(aspects: { aspect: string; status: string }[]): Record<string, string> {
  return Object.fromEntries(aspects.map((a) => [a.aspect, a.status]));
}

test("all aspects pass when actual matches expected", () => {
  const aspects = compareCase(base, { valid: true, diagnostics: [], ast: { a: 1 } });
  assert.deepEqual(statuses(aspects), { valid: "pass", diagnostics: "pass", ast: "pass" });
});

test("html and downgrade are skipped, not failed, when no renderer exists", () => {
  const aspects = compareCase(
    { ...base, html: "<p>", downgrade: "x" },
    { valid: true, diagnostics: [], ast: { a: 1 } },
  );
  assert.deepEqual(statuses(aspects), {
    valid: "pass",
    diagnostics: "pass",
    ast: "pass",
    html: "skip",
    downgrade: "skip",
  });
});

test("html and downgrade are compared when the driver supplies them", () => {
  const aspects = compareCase(
    { ...base, html: "<p>", downgrade: "x" },
    { valid: true, diagnostics: [], ast: { a: 1 }, html: "<p>", downgrade: "y" },
  );
  assert.deepEqual(statuses(aspects), {
    valid: "pass",
    diagnostics: "pass",
    ast: "pass",
    html: "pass",
    downgrade: "fail",
  });
});

test("diagnostics are compared as a multiset and valid is checked independently", () => {
  const expected: ConformanceCase = { section: "x", markset: "{", valid: false, diagnostics: ["A_B", "C_D"] };
  const pass = compareCase(expected, { valid: false, diagnostics: ["C_D", "A_B"] });
  assert.deepEqual(statuses(pass), { valid: "pass", diagnostics: "pass" });

  const fail = compareCase(expected, { valid: true, diagnostics: ["A_B"] });
  assert.deepEqual(statuses(fail), { valid: "fail", diagnostics: "fail" });
  assert.match(fail.find((a) => a.aspect === "diagnostics")!.detail!, /expected \[A_B, C_D\], got \[A_B\]/);
});

test("an ast on an invalid case is checked only when present", () => {
  const expected: ConformanceCase = { section: "x", markset: "{", valid: false, diagnostics: ["A_B"] };
  const aspects = compareCase(expected, { valid: false, diagnostics: ["A_B"], ast: { anything: true } });
  assert.deepEqual(statuses(aspects), { valid: "pass", diagnostics: "pass" });
});

test("driver problems and thrown errors are reported as driver failures", () => {
  const problems = compareCase(base, { valid: true, diagnostics: [], ast: { a: 1 }, problems: ["leftover input"] });
  assert.equal(problems.filter((a) => a.aspect === "driver" && a.status === "fail").length, 1);

  const throwing: Driver = () => {
    throw new Error("boom");
  };
  const result = runCase(base, 1, throwing);
  assert.equal(result.aspects[0].status, "fail");
  assert.match(result.aspects[0].detail!, /boom/);
});

test("a section without a driver is skipped", () => {
  const result = runCase(base, 3, undefined);
  assert.deepEqual(result.aspects, [{ aspect: "driver", status: "skip", detail: 'no driver for section "x"' }]);
  assert.equal(result.name, "case 3");
});

test("runSuite validates files against the schema and checks the section name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markset-conf-"));
  await writeFile(join(dir, "good.json"), JSON.stringify([{ section: "good", markset: "", valid: true, ast: 1 }]));
  await writeFile(join(dir, "mismatch.json"), JSON.stringify([{ section: "other", markset: "", valid: true, ast: 1 }]));
  await writeFile(join(dir, "broken.json"), JSON.stringify([{ section: "broken", valid: true }]));
  await writeFile(join(dir, "notjson.json"), "{");

  const echo: Driver = () => ({ valid: true, diagnostics: [], ast: 1 });
  const result = await runSuite({
    testsDir: dir,
    drivers: { good: echo, mismatch: echo, broken: echo, notjson: echo },
  });
  const byName = Object.fromEntries(result.files.map((f) => [f.section, f]));

  assert.equal(byName.good.cases.length, 1);
  assert.equal(
    byName.good.cases[0].aspects.every((a) => a.status === "pass"),
    true,
  );
  assert.match(byName.mismatch.fileErrors[0], /declares section "other"/);
  assert.ok(byName.broken.schemaErrors.some((e) => e.message.includes('"markset"')));
  assert.match(byName.notjson.fileErrors[0], /could not read as JSON/);
  assert.equal(suitePassed(result), false);

  const onlyGood = await runSuite({ testsDir: dir, drivers: { good: echo }, section: "good" });
  assert.equal(onlyGood.files.length, 1);
  assert.equal(suitePassed(onlyGood), true);
});
