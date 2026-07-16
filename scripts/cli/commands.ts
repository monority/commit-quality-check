// @ts-nocheck
import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { CommitMsgChecker } from "../../src/checkers/CommitMsgChecker.js";
import { ProjectContext } from "../../src/core/ProjectContext.js";
import { createQualityEngine } from "../../src/index.js";
import { ReportDispatcher } from "../../src/reporters/index.js";
import { detectPackageManager, getProjectRoot } from "../../src/utils/ProjectUtils.js";
import { formatSuggestionSummary, runCheck } from "../quality-staged.js";
import type { ColorCodes } from "./ui.js";
import type { CheckResult, CheckerSeverity, DiffAnalysis, TransparentScore } from "../../src/types.js";

const projRoot: string = await getProjectRoot();
const packageJsonPath = join(projRoot, "package.json");

export async function readProjectPackageFile(): Promise<Record<string, unknown>> {
  const raw = await readFile(packageJsonPath, "utf8");
  const clean = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  return JSON.parse(clean) as Record<string, unknown>;
}
export async function writeProjectPackageFile(projectPackage: Record<string, unknown>): Promise<void> {
  await writeFile(packageJsonPath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");
}

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface CheckerInfo {
  name: string;
  profile: string;
}

export async function getAvailableCheckers(): Promise<CheckerInfo[]> {
  const engine = createQualityEngine({ root: projRoot });
  await engine.loadCheckers();

  return engine.registry.allCheckers
    .map((checker: { name: string; profile?: string }) => ({
      name: checker.name,
      profile: checker.profile || "fast",
    }))
    .sort((a: CheckerInfo, b: CheckerInfo) => {
      if (a.profile !== b.profile) {
        return a.profile === "fast" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export async function getSkippedChecks(): Promise<Set<string>> {
  const projectPackage = await readProjectPackageFile();
  const gitQuality = projectPackage.gitQuality as Record<string, unknown> | undefined;
  return new Set<string>((gitQuality?.skip as string[]) || []);
}

export async function isAutoPushConfigured(): Promise<boolean> {
  const projectPackage = await readProjectPackageFile();
  const gitQuality = projectPackage.gitQuality as Record<string, unknown> | undefined;
  return gitQuality?.autoPush === true;
}

export async function getStagedFiles(): Promise<string[]> {
  try {
    const { stdout } = await execa(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      { cwd: projRoot },
    );

    return stdout
      .split("\n")
      .map((file: string) => file.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export interface StatusAnalysis {
  analysis: import("../../src/types.js").DiffAnalysis | null;
  stagedFiles: string[];
  scoreSummary: import("../../src/types.js").ScoreSummary | null;
  suggestionSummary: import("../../src/types.js").SuggestionSummary | null;
}

export async function getStatusAnalysis(): Promise<StatusAnalysis> {
  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    return {
      analysis: null,
      stagedFiles,
      scoreSummary: null,
      suggestionSummary: null,
    };
  }

  const projectPackage = await readProjectPackageFile();
  const packageManager = await detectPackageManager(projRoot);
  const context = await ProjectContext.create({
    root: projRoot,
    projectPackage,
    packageManager,
    stagedFiles,
  });

  return {
    analysis: context.analysis,
    stagedFiles,
    scoreSummary: context.scoreSummary,
    suggestionSummary: context.suggestionSummary,
  };
}

export function buildJsonAnalysisPayload(statusAnalysis: StatusAnalysis): Record<string, unknown> {
  return {
    stagedFiles: statusAnalysis.stagedFiles,
    analysis: statusAnalysis.analysis,
    scoreSummary: statusAnalysis.scoreSummary,
    suggestionSummary: statusAnalysis.suggestionSummary,
  };
}

export function formatStatusAnalysis(analysis: StatusAnalysis, C: ColorCodes): string {
  if (!analysis) {
    return "";
  }

  const { stagedFiles, scoreSummary, suggestionSummary } = analysis;
  let content = `staged files: ${C.green}${stagedFiles.length}${C.reset}`;

  if (suggestionSummary) {
    content += `\nsuggested commit: ${C.cyan}${suggestionSummary.suggestedHeader}${C.reset}`;
  }

  if (!scoreSummary) {
    return content;
  }

  content +=
    `\nprobable type: ${C.cyan}${scoreSummary.probableType}${C.reset}` +
    `\nprobable scope: ${C.cyan}${scoreSummary.probableScope}${C.reset}` +
    `\nrisk: ${C.yellow}${scoreSummary.riskLevel}${C.reset} (${scoreSummary.riskScore}/100)` +
    `\nglobal score: ${C.green}${scoreSummary.globalScore}/100${C.reset}`;

  return content;
}

export async function saveAutoPushConfig(enabled: boolean): Promise<void> {
  const projectPackage = await readProjectPackageFile();
  projectPackage.gitQuality = {
    ...((projectPackage.gitQuality as Record<string, unknown>) || {}),
    autoPush: enabled,
  };

  await writeProjectPackageFile(projectPackage);
}

export async function saveSkippedChecks(skipSet: Set<string>): Promise<void> {
  const projectPackage = await readProjectPackageFile();
  const nextSkip = [...skipSet].sort((a, b) => a.localeCompare(b));

  projectPackage.gitQuality = {
    ...((projectPackage.gitQuality as Record<string, unknown>) || {}),
    skip: nextSkip,
  };

  await writeProjectPackageFile(projectPackage);
}

export async function configureChecks(): Promise<void> {
  const { C, drawChecklist, setRawMode } = await import("./ui.js");
  const readline = (await import("node:readline")).default;

  if (!process.stdin.isTTY) {
    console.log("Interactive check configuration requires a TTY.");
    return;
  }

  const checkers = await getAvailableCheckers();
  const skipSet = await getSkippedChecks();
  let cursor = 0;
  const items = checkers.map((checker) => ({
    ...checker,
    enabled: !skipSet.has(checker.name),
  }));

  drawChecklist("CONFIGURE CHECKS", items, cursor, "Arrows move  SPACE toggle  ENTER save  Q cancel");

  return new Promise<void>((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const onKey = async (_: string, key: KeypressKey) => {
      if (key?.name === "up") {
        cursor = Math.max(0, cursor - 1);
        drawChecklist("CONFIGURE CHECKS", items, cursor, "Arrows move  SPACE toggle  ENTER save  Q cancel");
        return;
      }

      if (key?.name === "down") {
        cursor = Math.min(items.length - 1, cursor + 1);
        drawChecklist("CONFIGURE CHECKS", items, cursor, "Arrows move  SPACE toggle  ENTER save  Q cancel");
        return;
      }

      if (key?.name === "space") {
        items[cursor].enabled = !items[cursor].enabled;
        drawChecklist("CONFIGURE CHECKS", items, cursor, "Arrows move  SPACE toggle  ENTER save  Q cancel");
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        const nextSkipSet = new Set<string>(
          items.filter((item) => !item.enabled).map((item) => item.name),
        );
        await saveSkippedChecks(nextSkipSet);
        console.clear();
        console.log(`${C.green}Check configuration saved${C.reset}`);
        resolve();
        return;
      }

      if (key?.name === "q" || (key?.ctrl && key?.name === "c") || key?.name === "escape") {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        console.log(`${C.yellow}Check configuration cancelled${C.reset}`);
        resolve();
      }
    };

    process.stdin.on("keypress", onKey);
    setRawMode(true);
  });
}

export async function runSingleCheckMenu(rootOverride: string | null = null): Promise<void> {
  const { C, drawChecklist, setRawMode } = await import("./ui.js");
  const readline = (await import("node:readline")).default;

  if (!process.stdin.isTTY) {
    console.log("Interactive single-check mode requires a TTY.");
    return;
  }

  const checkers = await getAvailableCheckers();
  let cursor = 0;

  drawChecklist(
    "RUN SINGLE CHECK",
    checkers.map((checker) => ({ ...checker, enabled: true })),
    cursor,
    "Arrows move  ENTER run selected check  Q cancel",
  );

  return new Promise<void>((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const onKey = async (_: string, key: KeypressKey) => {
      if (key?.name === "up") {
        cursor = Math.max(0, cursor - 1);
        drawChecklist(
          "RUN SINGLE CHECK",
          checkers.map((checker) => ({ ...checker, enabled: true })),
          cursor,
          "Arrows move  ENTER run selected check  Q cancel",
        );
        return;
      }

      if (key?.name === "down") {
        cursor = Math.min(checkers.length - 1, cursor + 1);
        drawChecklist(
          "RUN SINGLE CHECK",
          checkers.map((checker) => ({ ...checker, enabled: true })),
          cursor,
          "Arrows move  ENTER run selected check  Q cancel",
        );
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        const selectedChecker = checkers[cursor];
        await runCheck({
          fullProfile: selectedChecker.profile === "full",
          onlyCheckNames: [selectedChecker.name],
          root: rootOverride || projRoot,
        });
        resolve();
        return;
      }

      if (key?.name === "q" || (key?.ctrl && key?.name === "c") || key?.name === "escape") {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        console.log(`${C.yellow}Single check cancelled${C.reset}`);
        resolve();
      }
    };

    process.stdin.on("keypress", onKey);
    setRawMode(true);
  });
}

export async function runCommitMsg(commitMsgPath: string | null): Promise<void> {
  const checker = new CommitMsgChecker();
  // CommitMsgChecker.run() accepts a context-like object with root + commitMsgPath
  const ctx = { root: projRoot, commitMsgPath } as unknown as Parameters<InstanceType<typeof CommitMsgChecker>["run"]>[0];
  const result = await checker.run(ctx);

  if (result.success) {
    console.log("Commit Message Quality: " + result.message);
    return;
  }

  console.error("Commit Message Quality: " + result.message);
  if (result.suggestedFix) {
    console.error(`Fix: ${result.suggestedFix}`);
  }
  if (result.details) {
    console.error(result.details);
  }
  process.exit(1);
}

export async function createSuggestedCommit(arg: string | null = null): Promise<void> {
  const { C, promptCommitMessage } = await import("./ui.js");
  const statusAnalysis = await getStatusAnalysis();

  if (!statusAnalysis.stagedFiles.length) {
    console.error(`${C.yellow}No staged files available for commit${C.reset}`);
    process.exitCode = 1;
    return;
  }

  const suggestedHeader = statusAnalysis.suggestionSummary?.suggestedHeader;
  if (!suggestedHeader) {
    console.error(`${C.yellow}No commit suggestion available${C.reset}`);
    process.exitCode = 1;
    return;
  }

  const commitMessage = arg?.trim()
    ? arg.trim()
    : await promptCommitMessage(statusAnalysis, suggestedHeader);

  if (!commitMessage) {
    console.log(`${C.yellow}Commit cancelled${C.reset}`);
    return;
  }

  const result = await execa("git", ["commit", "-m", commitMessage], {
    cwd: projRoot,
    reject: false,
  });

  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
    return;
  }

  console.log(`${C.green}Commit created: ${commitMessage}${C.reset}`);
}

export function resolveJsonCheckProfile(arg: string | null): string {
  if (arg === "--full" || arg === "full") {
    return "full";
  }

  return "fast";
}

export async function runJsonCheck(arg: string | null = null): Promise<void> {
  const profile = resolveJsonCheckProfile(arg);
  const startTime = Date.now();
  const stagedFiles = await getStagedFiles();
  const projectPackage = await readProjectPackageFile();
  const packageManager = await detectPackageManager(projRoot);
  const engine = createQualityEngine({
    root: projRoot,
    projectPackage,
    packageManager,
    stagedFiles,
    generateReport: true,
    quiet: true,
  });
  const outcome = await engine.run(profile);
  const durationMs = Date.now() - startTime;

  console.log(JSON.stringify({
    profile,
    durationMs,
    stagedFiles,
    allSuccess: outcome.allSuccess,
    results: outcome.results,
    analysis: outcome.analysis,
    scoreSummary: outcome.scoreSummary,
    suggestionSummary: outcome.suggestionSummary,
    reportPath: outcome.reportPath,
  }, null, 2));

  // GitHub Actions annotations
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const result of outcome.results) {
      if (!result.success) {
        const msg = result.message || `${result.name} failed`;
        console.log(`::warning title=${result.name}::${msg}`);
      }
    }
    if (outcome.scoreSummary?.recommendations) {
      for (const rec of outcome.scoreSummary.recommendations) {
        console.log(`::notice title=Recommendation::${rec}`);
      }
    }
    if (outcome.scoreSummary?.globalScore !== undefined) {
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `score=${outcome.scoreSummary.globalScore}\n`);
      }
    }
  }

  if (!outcome.allSuccess) {
    process.exitCode = 1;
  }
}

export function shouldPrintTargetProject(choice: string, arg: string | null): boolean {
  if (!arg || choice === "commit-msg") {
    return false;
  }

  if (choice === "commit") {
    return false;
  }

  if (choice === "json-check" && (arg === "--full" || arg === "full")) {
    return false;
  }

  return true;
}

export async function executeAction(
  choice: string,
  arg: string | null = null,
  pauseAfter: boolean = true,
): Promise<void> {
  const { C, pauseForTTY } = await import("./ui.js");
  const {
    toggleHook,
    toggleAutoPush,
    enableHook,
    disableHook,
  } = await import("./hooks.js");

  switch (choice) {
    case "toggle":
      await toggleHook();
      break;
    case "auto-push":
      await toggleAutoPush();
      break;
    case "config":
      await configureChecks();
      break;
    case "single":
      await runSingleCheckMenu(arg);
      break;
    case "enable":
      await enableHook();
      break;
    case "disable":
      await disableHook();
      break;
    case "status":
      await showStatus();
      break;
    case "suggest":
      await showSuggestion();
      break;
    case "json":
      await showJsonAnalysis();
      break;
    case "json-check":
      await runJsonCheck(arg);
      break;
    case "commit":
      await createSuggestedCommit(arg);
      break;
    case "staged":
      await runCheck({ fullProfile: false, root: arg || projRoot });
      break;
    case "check":
      await runCheck({ fullProfile: true, root: arg || projRoot });
      break;
    case "commit-msg":
      await runCommitMsg(arg);
      break;
    case "report":
      await runReport(parseReportOptions(arg));
      break;
    case "quit":
      break;
    default:
      if (choice) console.log(`${C.yellow}Unknown command: ${choice}${C.reset}`);
  }

  if (pauseAfter && choice !== "quit") {
    await pauseForTTY();
  }
}

export async function showStatus(): Promise<void> {
  const { C } = await import("./ui.js");
  const { getHookState } = await import("./hooks.js");
  const hookState = await getHookState();
  const skippedChecks = await getSkippedChecks();
  const allCheckers = await getAvailableCheckers();
  const statusAnalysis = await getStatusAnalysis();
  const enabledCount = allCheckers.length - skippedChecks.size;
  const stateLabel = hookState.enabled
    ? `${C.green}ON${C.reset}`
    : hookState.broken
      ? `${C.yellow}BROKEN${C.reset}`
      : `${C.red}OFF${C.reset}`;
  const analysisBlock = formatStatusAnalysis(statusAnalysis, C);

  console.log(
    `\n${C.cyan}STATUS${C.reset}\n` +
    `hook: ${stateLabel}\n` +
    `pre-commit: ${hookState.preCommit ? `${C.green}OK` : `${C.red}MISSING/BAD`}${C.reset}\n` +
    `commit-msg: ${hookState.commitMsg ? `${C.green}OK` : `${C.red}MISSING/BAD`}${C.reset}\n` +
    `auto-push: ${hookState.autoPush ? `${C.green}ON` : `${C.red}OFF`}${C.reset}\n` +
    `core.hooksPath: ${hookState.hooksPath ? `${C.green}${hookState.hooksPathValue}` : `${C.red}MISSING/BAD`}${C.reset}\n` +
    `checks enabled: ${C.green}${enabledCount}${C.reset}/${allCheckers.length}` +
    (analysisBlock ? `\n${analysisBlock}` : ""),
  );
}

export async function showSuggestion(): Promise<void> {
  const { C } = await import("./ui.js");
  const statusAnalysis = await getStatusAnalysis();

  if (!statusAnalysis.stagedFiles.length) {
    console.log(`${C.yellow}No staged files available for commit suggestion${C.reset}`);
    return;
  }

  const suggestionBlock = formatSuggestionSummary(statusAnalysis.suggestionSummary).trim();
  if (!suggestionBlock) {
    console.log(`${C.yellow}No commit suggestion available${C.reset}`);
    return;
  }

  console.log(suggestionBlock);
}

export async function showJsonAnalysis(): Promise<void> {
  const statusAnalysis = await getStatusAnalysis();
  console.log(JSON.stringify(buildJsonAnalysisPayload(statusAnalysis), null, 2));
}

export interface ReportOptions {
  reporters?: string[];
  output?: string;
  fullProfile?: boolean;
  root?: string;
}

/**
 * Parse report options from CLI arg string.
 */
export function parseReportOptions(arg: string | null): ReportOptions {
  const options: ReportOptions = { reporters: ['cli'] };
  if (!arg) return options;

  const parts = arg.split(',');
  const reporterNames: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === 'json' || trimmed === 'sarif' || trimmed === 'markdown' || trimmed === 'cli') {
      reporterNames.push(trimmed);
    }
  }
  if (reporterNames.length > 0) {
    options.reporters = reporterNames;
  }
  return options;
}

/**
 * Run quality checks and generate reports via the ReportDispatcher.
 */
export async function runReport(options: ReportOptions = {}): Promise<void> {
  const { C } = await import("./ui.js");
  const reporters = options.reporters || ['cli'];
  const root = options.root || projRoot;

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log(`${C.yellow}No staged files available${C.reset}`);
    return;
  }

  const projectPackage = await readProjectPackageFile();
  const packageManager = await detectPackageManager(root);
  const engine = createQualityEngine({
    root,
    projectPackage,
    packageManager,
    stagedFiles,
    quiet: true,
  });

  const profile = options.fullProfile ? "full" : "fast";
  const outcome = await engine.run(profile);

  // Build checkerResults with status field for new reporters
  const checkerResults = outcome.results.map((r: CheckResult) => ({
    name: r.name || r.checker || "unknown",
    checker: r.checker || r.name || "unknown",
    success: r.success,
    status: r.status || (r.success ? 'pass' : 'fail'),
    message: r.message,
    severity: r.severity,
  }));

  // Build score data from transparentScore
  const scoreData: TransparentScore = outcome.transparentScore || {
    globalScore: outcome.scoreSummary?.globalScore ?? 0,
    categories: [],
    recommendations: [],
    weights: { message_quality: 0, history_quality: 0, workflow_quality: 0 },
  };

  // Build file output paths
  const files: Record<string, string> = {};
  const customOutput = options.output;
  if (reporters.includes('json')) {
    files.json = customOutput || 'report.json';
  }
  if (reporters.includes('sarif')) {
    files.sarif = customOutput || 'report.sarif';
  }
  if (reporters.includes('markdown')) {
    files.markdown = customOutput || 'quality-report.md';
  }

  const dispatcher = new ReportDispatcher();
  const { outputs, files: writtenFiles } = dispatcher.dispatch(
    {
      score: scoreData,
      checkerResults,
      analysis: outcome.analysis ?? undefined,
    },
    { reporters, files },
  );

  if (writtenFiles.length > 0) {
    for (const f of writtenFiles) {
      console.log(`${C.green}Report written: ${f}${C.reset}`);
    }
  }

  // GitHub Actions annotations
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const result of checkerResults) {
      if (result.status === 'fail') {
        const msg = result.message || `${result.checker} failed`;
        console.log(`::warning title=${result.checker}::${msg}`);
      }
    }
    if (scoreData?.recommendations) {
      for (const rec of scoreData.recommendations) {
        console.log(`::notice title=Recommendation::${rec}`);
      }
    }
    if (scoreData?.globalScore !== undefined) {
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `score=${scoreData.globalScore}\n`);
      }
    }
  }

  if (!outcome.allSuccess) {
    process.exitCode = 1;
  }
}
