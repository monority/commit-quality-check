import test from "node:test";
import assert from "node:assert/strict";
import { parseAuditVulnerabilityCount, SecurityChecker } from "../src/checkers/SecurityChecker.js";

test("parseAuditVulnerabilityCount reads npm audit --json metadata", () => {
  const npmJson = JSON.stringify({
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 0, critical: 0, total: 3 } },
  });
  assert.equal(parseAuditVulnerabilityCount(npmJson), 3);
});

test("parseAuditVulnerabilityCount counts pnpm audit --json advisories", () => {
  const pnpmJson = JSON.stringify([
    { module_name: "a", severity: "high" },
    { module_name: "b", severity: "low" },
  ]);
  assert.equal(parseAuditVulnerabilityCount(pnpmJson), 2);
  assert.equal(parseAuditVulnerabilityCount("[]"), 0);
});

test("parseAuditVulnerabilityCount falls back to plain-text summary", () => {
  assert.equal(parseAuditVulnerabilityCount("found 3 vulnerabilities"), 3);
  assert.equal(parseAuditVulnerabilityCount("3 vulnerabilities found"), 3);
  assert.equal(parseAuditVulnerabilityCount("found 0 vulnerabilities"), 0);
});

test("parseAuditVulnerabilityCount treats unknown output as zero", () => {
  assert.equal(parseAuditVulnerabilityCount(""), 0);
  assert.equal(parseAuditVulnerabilityCount("ERR_PNPM_NO_LOCKFILE something went wrong"), 0);
  assert.equal(parseAuditVulnerabilityCount("not json at all"), 0);
});

test("SecurityChecker has correct metadata", () => {
  const checker = new SecurityChecker();
  assert.equal(checker.name, "Dependencies Vulnerabilities");
  assert.equal(checker.profile, "fast");
});
