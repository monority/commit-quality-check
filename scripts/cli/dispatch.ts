import { appendFileSync } from "node:fs";
import { ReportDispatcher } from "../../src/reporters/index.js";
import type {
  CheckResult,
  CheckerSeverity,
  DiffAnalysis,
  TransparentScore,
} from "../../src/types.js";

/** Shape returned by QualityEngine.run(). */
export interface EngineOutcome {
  allSuccess: boolean;
  results: CheckResult[];
  analysis: DiffAnalysis | null;
  scoreSummary: (import("../../src/types.js").ScoreSummary & TransparentScore) | null;
  transparentScore: TransparentScore | null;
  suggestionSummary: import("../../src/types.js").SuggestionSummary | null;
  reportPath: string | null;
}

export function splitReporterList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}

/** Map requested reporters to default output file paths. */
export function defaultReportFiles(
  reporters: string[],
  customOutput?: string | null,
): Record<string, string> {
  const files: Record<string, string> = {};
  if (reporters.includes("json")) files.json = customOutput || "report.json";
  if (reporters.includes("sarif")) files.sarif = customOutput || "report.sarif";
  if (reporters.includes("markdown")) files.markdown = customOutput || "quality-report.md";
  return files;
}

export function buildCheckerResults(results: CheckResult[]): CheckResult[] {
  return results.map((r: CheckResult) => ({
    name: r.name || r.checker || "unknown",
    checker: r.checker || r.name || "unknown",
    success: r.success,
    status: r.status || (r.success ? "pass" : "fail"),
    message: r.message,
    severity: (r.severity ?? "info") as CheckerSeverity,
  }));
}

export function buildScoreData(outcome: EngineOutcome): TransparentScore {
  return (
    outcome.transparentScore || {
      globalScore: outcome.scoreSummary?.globalScore ?? 0,
      categories: [],
      recommendations: outcome.scoreSummary?.recommendations ?? [],
      weights: { message_quality: 0, history_quality: 0, workflow_quality: 0 },
    }
  );
}

export function dispatchReports(
  outcome: EngineOutcome,
  reporters: string[],
  files: Record<string, string>,
): string[] {
  const dispatcher = new ReportDispatcher();
  const payload = {
    score: buildScoreData(outcome),
    checkerResults: buildCheckerResults(outcome.results),
    ...(outcome.analysis ? { analysis: outcome.analysis } : {}),
  };
  return dispatcher.dispatch(payload, { reporters, files }).files;
}

/** Emit GitHub Actions annotations and outputs (warnings/notices go to stderr). */
export function emitGithubAnnotations(outcome: EngineOutcome): void {
  if (process.env.GITHUB_ACTIONS !== "true") {
    return;
  }

  for (const result of outcome.results) {
    if (!result.success) {
      const msg = result.message || `${result.name} failed`;
      console.error(`::warning title=${result.name}::${msg}`);
    }
  }
  if (outcome.scoreSummary?.recommendations) {
    for (const rec of outcome.scoreSummary.recommendations) {
      console.error(`::notice title=Recommendation::${rec}`);
    }
  }
  if (outcome.scoreSummary?.globalScore !== undefined && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `score=${outcome.scoreSummary.globalScore}\n`);
  }
}
