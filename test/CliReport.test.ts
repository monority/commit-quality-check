import test from "node:test";
import assert from "node:assert/strict";
import { parseReportOptions } from "../scripts/cli/report.js";

test("parseReportOptions reads --reporters and --output flags", () => {
  const options = parseReportOptions("--reporters markdown,sarif --output reports");

  assert.deepEqual(options.reporters, ["markdown", "sarif"]);
  assert.equal(options.output, "reports");
});

test("parseReportOptions accepts a bare reporter list", () => {
  const options = parseReportOptions("markdown,sarif");

  assert.deepEqual(options.reporters, ["markdown", "sarif"]);
});

test("parseReportOptions ignores unknown reporters and flags", () => {
  const options = parseReportOptions("--reporters bogus,json");

  assert.deepEqual(options.reporters, ["json"]);
});

test("parseReportOptions defaults to cli", () => {
  assert.deepEqual(parseReportOptions(null).reporters, ["cli"]);
  assert.deepEqual(parseReportOptions("").reporters, ["cli"]);
});
