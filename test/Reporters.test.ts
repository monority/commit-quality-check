import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CliReporter } from "../src/reporters/CliReporter.js";
import { JsonReporter } from "../src/reporters/JsonReporter.js";
import { SarifReporter } from "../src/reporters/SarifReporter.js";
import { MarkdownReporter } from "../src/reporters/MarkdownReporter.js";
import { ReportDispatcher } from "../src/reporters/index.js";
import type { DiffAnalysis, TransparentScore, CheckResult } from "../src/types.js";
import pkg from "../package.json" with { type: "json" };

// --- Fixtures ---

const mockScore: TransparentScore = {
  globalScore: 72,
  categories: [
    {
      category: "message_quality",
      label: "Message Quality",
      score: 80,
      weight: 40,
      weightedScore: 32,
      penalties: [
        { reason: "WIP commit detected", impact: -10, recommendation: "Use descriptive commit messages" },
      ],
      breakdown: [{ label: "conventional", value: 90 }, { label: "scope", value: 70 }],
    },
    {
      category: "history_quality",
      label: "History Quality",
      score: 65,
      weight: 40,
      weightedScore: 26,
      penalties: [],
      breakdown: [{ label: "atomicity", value: 60 }, { label: "size", value: 70 }],
    },
    {
      category: "workflow_quality",
      label: "Workflow Quality",
      score: 70,
      weight: 20,
      weightedScore: 14,
      penalties: [],
      breakdown: [{ label: "tests", value: 70 }],
    },
  ],
  recommendations: [
    "Add tests for changed source files",
    "Use conventional commit format",
  ],
};

const mockCheckerResults: CheckResult[] = [
  { name: "Commit Message", checker: "commit-msg", success: true, status: "pass", message: "Valid conventional commit" },
  { name: "Linting", checker: "lint", success: false, status: "fail", message: "ESLint found 3 errors", severity: "error" },
  { name: "Tests", checker: "test", success: true, status: "pass", message: "All tests passed" },
  { name: "Type Check", checker: "typecheck", success: false, status: "skip", message: "No typecheck script found" },
];

const mockAnalysis: DiffAnalysis = {
  files: ["src/auth/login.ts", "tests/auth/login.spec.ts", "README.md"],
  sourceFiles: ["src/auth/login.ts"],
  testFiles: ["tests/auth/login.spec.ts"],
  deletedFiles: [],
  deletedTestFiles: [],
  removedTestLines: [],
  lineStats: { added: 42, removed: 10 },
  documentationFiles: ["README.md"],
  configFiles: [],
  ciFiles: [],
  dependencyFiles: [],
  lockfileFiles: [],
  envFiles: [],
  authFiles: [],
  migrationFiles: [],
  topLevelAreas: ["src", "tests"],
  workspaceScopes: ["auth"],
  signals: {
    hasSourceChanges: true,
    hasTests: true,
    hasDocumentation: true,
    touchesConfig: false,
    touchesCI: false,
    touchesDependencies: false,
    touchesLockfiles: false,
    touchesEnv: false,
    touchesAuth: false,
    touchesMigrations: false,
    removesTests: false,
  },
};

const mockData = {
  score: mockScore,
  checkerResults: mockCheckerResults,
  analysis: mockAnalysis,
};

// --- CliReporter Tests ---

test("CliReporter formats output with header and score", () => {
  const reporter = new CliReporter();
  const output = reporter.report(mockData);

  assert.match(output, /Commit Quality Check Report/);
  assert.match(output, /Global Score: 72\/100/);
});

test("CliReporter shows category scores with progress bars", () => {
  const reporter = new CliReporter();
  const output = reporter.report(mockData);

  assert.match(output, /Message Quality: 80\/100 \(weight: 40%\)/);
  assert.match(output, /History Quality: 65\/100 \(weight: 40%\)/);
  assert.match(output, /Workflow Quality: 70\/100 \(weight: 20%\)/);
  // Progress bar characters
  assert.match(output, /█/);
  assert.match(output, /░/);
});

test("CliReporter shows penalties", () => {
  const reporter = new CliReporter();
  const output = reporter.report(mockData);

  assert.match(output, /WIP commit detected/);
  assert.match(output, /\(-10\)/);
});

test("CliReporter shows checker results with icons", () => {
  const reporter = new CliReporter();
  const output = reporter.report(mockData);

  assert.match(output, /✓/); // pass
  assert.match(output, /✗/); // fail
  assert.match(output, /○/); // skip
  assert.match(output, /commit-msg:/);
  assert.match(output, /lint:/);
});

test("CliReporter shows recommendations", () => {
  const reporter = new CliReporter();
  const output = reporter.report(mockData);

  assert.match(output, /Recommendations/);
  assert.match(output, /Add tests for changed source files/);
  assert.match(output, /Use conventional commit format/);
});

test("CliReporter handles empty data gracefully", () => {
  const reporter = new CliReporter();
  const output = reporter.report({});

  assert.match(output, /Commit Quality Check Report/);
  assert.match(output, /Global Score: N\/A\/100/);
});

test("CliReporter _progressBar generates correct width", () => {
  const reporter = new CliReporter();
  const bar = reporter._progressBar(50, 10);

  // 2 leading spaces + '[' + 5 filled + 5 empty + ']' = 14
  assert.equal(bar.length, 14);
  assert.match(bar, /  \[█████░░░░░\]/);
});

// --- JsonReporter Tests ---

test("JsonReporter produces valid JSON", () => {
  const reporter = new JsonReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(typeof parsed, "object");
});

test("JsonReporter has version and timestamp", () => {
  const reporter = new JsonReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.version, "1.0");
  assert.match(parsed.timestamp, /\d{4}-\d{2}-\d{2}T/);
});

test("JsonReporter score has global and categories", () => {
  const reporter = new JsonReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.score.global, 72);
  assert.equal(parsed.score.categories.length, 3);
  assert.equal(parsed.score.categories[0].category, "message_quality");
  assert.equal(parsed.score.categories[0].score, 80);
  assert.equal(parsed.score.categories[0].weight, 40);
  assert.equal(parsed.score.categories[0].weightedScore, 32);
});

test("JsonReporter checkers has counts", () => {
  const reporter = new JsonReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.checkers.total, 4);
  assert.equal(parsed.checkers.passed, 2);
  assert.equal(parsed.checkers.failed, 1);
  assert.equal(parsed.checkers.skipped, 1);
});

test("JsonReporter analysis has file counts and line stats", () => {
  const reporter = new JsonReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.analysis.files, 3);
  assert.equal(parsed.analysis.addedLines, 42);
  assert.equal(parsed.analysis.removedLines, 10);
});

test("JsonReporter writes to file when output option provided", () => {
  const reporter = new JsonReporter();
  const tmpFile = join(process.env.TEMP || ".", "test-report.json");

  try {
    const output = reporter.report(mockData, { output: tmpFile });
    const fileContent = readFileSync(tmpFile, "utf8");
    const parsed = JSON.parse(fileContent);

    assert.equal(parsed.version, "1.0");
    assert.equal(parsed.score.global, 72);
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
});

test("JsonReporter handles null score", () => {
  const reporter = new JsonReporter();
  const output = reporter.report({ checkerResults: [], analysis: null });
  const parsed = JSON.parse(output);

  assert.equal(parsed.score, null);
});

// --- SarifReporter Tests ---

test("SarifReporter produces valid SARIF JSON", () => {
  const reporter = new SarifReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.version, "2.1.0");
  assert.match(parsed.$schema, /sarif-schema-2\.1\.0/);
});

test("SarifReporter has runs array with tool info", () => {
  const reporter = new SarifReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.runs.length, 1);
  assert.equal(parsed.runs[0].tool.driver.name, "commit-quality-check");
  assert.equal(parsed.runs[0].tool.driver.version, pkg.version);
});

test("SarifReporter converts checker failures to results", () => {
  const reporter = new SarifReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  const failResults = parsed.runs[0].results.filter(r => r.level === "error" || r.level === "warning" || r.level === "note");
  const checkerFailures = failResults.filter(r => r.ruleId === "lint");

  assert.ok(checkerFailures.length > 0);
  assert.equal(checkerFailures[0].level, "error");
  assert.match(checkerFailures[0].message.text, /ESLint/);
});

test("SarifReporter converts penalties to results", () => {
  const reporter = new SarifReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  const penaltyResults = parsed.runs[0].results.filter(r => r.ruleId.startsWith("penalty/"));

  assert.ok(penaltyResults.length > 0);
  assert.match(penaltyResults[0].message.text, /WIP commit detected/);
  assert.equal(penaltyResults[0].properties.impact, -10);
});

test("SarifReporter includes globalScore in properties", () => {
  const reporter = new SarifReporter();
  const output = reporter.report(mockData);
  const parsed = JSON.parse(output);

  assert.equal(parsed.runs[0].properties.globalScore, 72);
});

test("SarifReporter writes to file when output option provided", () => {
  const reporter = new SarifReporter();
  const tmpFile = join(process.env.TEMP || ".", "test-report.sarif");

  try {
    reporter.report(mockData, { output: tmpFile });
    const fileContent = readFileSync(tmpFile, "utf8");
    const parsed = JSON.parse(fileContent);

    assert.equal(parsed.version, "2.1.0");
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
});

test("SarifReporter handles empty data", () => {
  const reporter = new SarifReporter();
  const output = reporter.report({});
  const parsed = JSON.parse(output);

  assert.equal(parsed.version, "2.1.0");
  assert.deepEqual(parsed.runs[0].results, []);
});

// --- MarkdownReporter Tests ---

test("MarkdownReporter generates markdown with header", () => {
  const reporter = new MarkdownReporter();
  const output = reporter.report(mockData);

  assert.match(output, /# Quality Check Report/);
  assert.match(output, /Generated on:/);
});

test("MarkdownReporter includes score section", () => {
  const reporter = new MarkdownReporter();
  const output = reporter.report(mockData);

  assert.match(output, /## Score/);
  assert.match(output, /\*\*Global Score: 72\/100\*\*/);
  assert.match(output, /Message Quality.*80\/100/);
});

test("MarkdownReporter includes results table", () => {
  const reporter = new MarkdownReporter();
  const output = reporter.report(mockData);

  assert.match(output, /## Results/);
  assert.match(output, /\| Checker \| Status \| Message \|/);
  assert.match(output, /commit-msg.*PASS/);
  assert.match(output, /lint.*FAIL/);
  assert.match(output, /typecheck.*SKIP/);
});

test("MarkdownReporter includes recommendations", () => {
  const reporter = new MarkdownReporter();
  const output = reporter.report(mockData);

  assert.match(output, /## Recommendations/);
  assert.match(output, /Add tests for changed source files/);
});

test("MarkdownReporter handles empty data", () => {
  const reporter = new MarkdownReporter();
  const output = reporter.report({});

  assert.match(output, /# Quality Check Report/);
  assert.doesNotMatch(output, /## Score/);
  assert.doesNotMatch(output, /## Results/);
});

// --- ReportDispatcher Tests ---

test("ReportDispatcher dispatches to cli by default", () => {
  const dispatcher = new ReportDispatcher();
  const { outputs, files } = dispatcher.dispatch(mockData);

  assert.ok(outputs.cli);
  assert.match(outputs.cli, /Commit Quality Check Report/);
  assert.deepEqual(files, []);
});

test("ReportDispatcher dispatches to multiple reporters", () => {
  const dispatcher = new ReportDispatcher();
  const { outputs } = dispatcher.dispatch(mockData, { reporters: ["cli", "json"] });

  assert.ok(outputs.cli);
  assert.ok(outputs.json);
  const parsed = JSON.parse(outputs.json);
  assert.equal(parsed.score.global, 72);
});

test("ReportDispatcher writes files when files option provided", () => {
  const dispatcher = new ReportDispatcher();
  const tmpJson = join(process.env.TEMP || ".", "test-dispatch.json");
  const tmpMd = join(process.env.TEMP || ".", "test-dispatch.md");

  try {
    const { outputs, files } = dispatcher.dispatch(mockData, {
      reporters: ["json", "markdown"],
      files: { json: tmpJson, markdown: tmpMd },
    });

    assert.ok(files.includes(tmpJson));
    assert.ok(files.includes(tmpMd));
    assert.ok(existsSync(tmpJson));
    assert.ok(existsSync(tmpMd));

    const jsonContent = readFileSync(tmpJson, "utf8");
    const parsed = JSON.parse(jsonContent);
    assert.equal(parsed.score.global, 72);

    const mdContent = readFileSync(tmpMd, "utf8");
    assert.match(mdContent, /# Quality Check Report/);
  } finally {
    if (existsSync(tmpJson)) unlinkSync(tmpJson);
    if (existsSync(tmpMd)) unlinkSync(tmpMd);
  }
});

test("ReportDispatcher skips unknown reporter names", () => {
  const dispatcher = new ReportDispatcher();
  const { outputs } = dispatcher.dispatch(mockData, { reporters: ["cli", "unknown"] });

  assert.ok(outputs.cli);
  assert.equal(outputs.unknown, undefined);
});

test("ReportDispatcher default reporters is ['cli']", () => {
  const dispatcher = new ReportDispatcher();
  const { outputs } = dispatcher.dispatch(mockData, {});

  assert.ok(outputs.cli);
  assert.equal(outputs.json, undefined);
  assert.equal(outputs.sarif, undefined);
  assert.equal(outputs.markdown, undefined);
});
