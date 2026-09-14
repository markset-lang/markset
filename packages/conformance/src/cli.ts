#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runSuite, suitePassed } from "./harness.ts";
import { formatReport } from "./report.ts";
import { drivers } from "./drivers.ts";

const { values } = parseArgs({
  options: {
    section: { type: "string", short: "s" },
    verbose: { type: "boolean", short: "v", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`usage: markset-conformance [--section <name>] [--verbose]

Validates every tests/*.json file against spec/conformance.schema.json, then
runs each case through the section's driver. Exit status is 1 when any aspect
fails or any file is malformed. Skipped aspects (no driver or renderer yet)
are reported but do not fail the run.`);
  process.exit(0);
}

const result = await runSuite({ drivers, section: values.section });
console.log(formatReport(result, { verbose: values.verbose }));
process.exit(suitePassed(result) ? 0 : 1);
