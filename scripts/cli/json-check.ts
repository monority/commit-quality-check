import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createQualityEngine } from "../../src/index.js";
import { detectPackageManager } from "../../src/utils/ProjectUtils.js";
import {
  defaultReportFiles,
  dispatchReports,
  emitGithubAnnotations,
  splitReporterList,
} from "./dispatch.js";
import type { EngineOutcome } from "./dispatch.js";
import { getStagedFiles, projRoot, readProjectPackageFile } from "./project.js";

export interface JsonCheckOptions {
  profile: string;
  reporters: string[];
  outputDir: string | null;
}

/**
 * Parse json-check arguments: `--full`, `--fast`, `--profile fast|full`,
 * `--reporters cli,json,sarif,markdown`, `--output <dir>`.
 * Falls back to `CQ_PROFILE`, `CQ_REPORTERS`, and `CQ_OUTPUT_DIR` env vars.
 */
export function parseJsonCheckArgs(arg: string | null = null): JsonCheckOptions {
  let profile: string | undefined;
  let reporters: string[] | undefined;
  let outputDir: string | undefined;

  const tokens = (arg ?? "").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--full" || token === "full") {
      profile = "full";
    } else if (token === "--fast" || token === "fast") {
      profile = "fast";
    } else if (token === "--profile" && i + 1 < tokens.length) {
      profile = tokens[++i] === "full" ? "full" : "fast";
    } else if (token === "--reporters" && i + 1 < tokens.length) {
      reporters = splitReporterList(tokens[++i]);
    } else if (token === "--output" && i + 1 < tokens.length) {
      outputDir = tokens[++i];
    }
  }

  return {
    profile: profile ?? process.env.CQ_PROFILE ?? "fast",
    reporters: reporters ?? splitReporterList(process.env.CQ_REPORTERS),
    outputDir: outputDir ?? process.env.CQ_OUTPUT_DIR ?? null,
  };
}

export function resolveJsonCheckProfile(arg: string | null): string {
  return parseJsonCheckArgs(arg).profile;
}

export async function runJsonCheck(arg: string | null = null): Promise<void> {
  const { profile, reporters, outputDir } = parseJsonCheckArgs(arg);
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
  const outcome = (await engine.run(profile)) as EngineOutcome;
  const durationMs = Date.now() - startTime;

  emitGithubAnnotations(outcome);

  // Write report files when reporters are requested. `cli` is excluded:
  // stdout carries the JSON payload and must stay parseable.
  const fileReporters = reporters.filter((r: string) => r !== "cli");
  let reportFiles: string[] = [];
  if (fileReporters.length > 0) {
    if (outputDir) mkdirSync(outputDir, { recursive: true });
    const base = (name: string) => (outputDir ? join(outputDir, name) : name);
    const defaults = defaultReportFiles(fileReporters);
    const files: Record<string, string> = {};
    for (const [name, path] of Object.entries(defaults)) {
      files[name] = base(path);
    }
    reportFiles = dispatchReports(outcome, fileReporters, files);
  }

  console.log(
    JSON.stringify(
      {
        profile,
        durationMs,
        stagedFiles,
        allSuccess: outcome.allSuccess,
        results: outcome.results,
        analysis: outcome.analysis,
        scoreSummary: outcome.scoreSummary,
        suggestionSummary: outcome.suggestionSummary,
        reportPath: outcome.reportPath,
        reportFiles,
      },
      null,
      2,
    ),
  );

  if (!outcome.allSuccess) {
    process.exitCode = 1;
  }
}

export function shouldPrintTargetProject(choice: string, arg: string | null): boolean {
  // stdout of json-check/commit-msg/commit must stay parseable or clean;
  // report args are flags, not a project root.
  if (
    !arg ||
    choice === "commit-msg" ||
    choice === "json-check" ||
    choice === "commit" ||
    choice === "report"
  ) {
    return false;
  }
  return true;
}
