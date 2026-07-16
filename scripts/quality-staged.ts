import { createQualityEngine } from "../src/index.js";
import {
  getProjectRoot,
  detectPackageManager,
  readProjectPackage,
  restageFiles,
} from "../src/utils/ProjectUtils.js";
import { execa } from "execa";
import { appendFileSync } from "node:fs";
import type { ScoreSummary, SuggestionSummary, Penalty, CategoryScore } from "../src/types.js";

export interface FormattedScoreSummary {
  categories?: CategoryScore[];
  globalScore: number;
  recommendations?: string[];
  probableType?: string;
  probableScope?: string;
  atomicity?: number;
  scopePrecision?: number;
  testsStatus?: string;
  testCoverage?: number;
  riskLevel?: string;
  riskScore?: number;
  reasons?: string[];
  penalties?: Penalty[];
}

export function formatScoreSummary(scoreSummary: FormattedScoreSummary | null): string {
  if (!scoreSummary) {
    return "";
  }

  const lines: string[] = [];

  // New transparent format if categories are available
  if (scoreSummary.categories && Array.isArray(scoreSummary.categories)) {
    for (const cat of scoreSummary.categories) {
      lines.push(`${cat.label}: ${cat.score}/100 (weight: ${cat.weight}%)`);
      if (cat.penalties && cat.penalties.length > 0) {
        const penaltyLines = cat.penalties.filter((p) => p.impact < 0);
        if (penaltyLines.length > 0) {
          lines.push("  Penalties:");
          for (const p of penaltyLines) {
            lines.push(`    - ${p.reason}: ${p.impact}`);
          }
        }
      }
    }
    lines.push(`Global Score: ${scoreSummary.globalScore}/100`);

    if (scoreSummary.recommendations && scoreSummary.recommendations.length > 0) {
      lines.push("");
      lines.push("Recommendations:");
      for (const rec of scoreSummary.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }
  } else {
    // Legacy format fallback
    lines.push(
      "",
      "Commit Quality Score",
      `Type: ${scoreSummary.probableType}`,
      `Scope: ${scoreSummary.probableScope}`,
      `Atomicity: ${scoreSummary.atomicity}`,
      `Scope Precision: ${scoreSummary.scopePrecision}`,
      `Tests: ${scoreSummary.testsStatus} (${scoreSummary.testCoverage})`,
      `Risk: ${scoreSummary.riskLevel} (${scoreSummary.riskScore}/100)`,
      `Global Score: ${scoreSummary.globalScore}/100`,
    );

    if (scoreSummary.reasons && scoreSummary.reasons.length > 0) {
      lines.push("Reasons:");
      scoreSummary.reasons.forEach((reason) => {
        lines.push(`- ${reason}`);
      });
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatSuggestionSummary(suggestionSummary: SuggestionSummary | null): string {
  if (!suggestionSummary) {
    return "";
  }

  const lines: string[] = [
    "",
    "Suggested Commit",
    suggestionSummary.suggestedHeader,
  ];

  if (suggestionSummary.rationale.length > 0) {
    lines.push("Why:");
    suggestionSummary.rationale.forEach((reason) => {
      lines.push(`- ${reason}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

export interface RunCheckOptions {
  fullProfile?: boolean;
  onlyCheckNames?: string[];
  root?: string;
}

export async function runCheck(options: RunCheckOptions = {}): Promise<void> {
  try {
    const root = options.root || await getProjectRoot();
    const packageManager = await detectPackageManager(root);
    const projectPackage = await readProjectPackage(root);

    const { stdout: stagedFilesOut } = await execa(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      { cwd: root },
    );
    const stagedFiles = stagedFilesOut
      .split("\n")
      .map((f: string) => f.trim())
      .filter(Boolean);

    const engine = createQualityEngine({
      generateReport: true,
      ...options,
      root,
      packageManager,
      projectPackage,
      stagedFiles,
      profile: options.fullProfile ? "full" : "fast",
    });

    console.log("Running commit quality checks...");
    const { allSuccess, results, scoreSummary, suggestionSummary } = await engine.run(options.fullProfile ? "full" : "fast");

    const suggestionBlock = formatSuggestionSummary(suggestionSummary);
    if (suggestionBlock) {
      console.log(suggestionBlock);
    }

    const scoreBlock = formatScoreSummary(scoreSummary);
    if (scoreBlock) {
      console.log(scoreBlock);
    }

    const totalResults = results.length;
    for (const [index, result] of results.entries()) {
      const prefix = `[${index + 1}/${totalResults}]`;
      if (result.success) {
        console.log(`PASS ${prefix} ${result.name}: ${result.message}`);
      } else {
        console.error(`FAIL ${prefix} ${result.name}: ${result.message}`);
      }
    }

    const failed = !allSuccess;

    // GitHub Actions annotations
    if (process.env.GITHUB_ACTIONS === 'true') {
      for (const result of results) {
        if (!result.success) {
          const msg = result.message || `${result.name} failed`;
          console.log(`::warning title=${result.name}::${msg}`);
        }
      }
      if (scoreSummary?.recommendations) {
        for (const rec of scoreSummary.recommendations) {
          console.log(`::notice title=Recommendation::${rec}`);
        }
      }
      if (scoreSummary?.globalScore !== undefined) {
        if (process.env.GITHUB_OUTPUT) {
          appendFileSync(process.env.GITHUB_OUTPUT, `score=${scoreSummary.globalScore}\n`);
        }
      }
    }

    if (stagedFiles.length > 0) {
      await restageFiles(stagedFiles, root);
    }

    if (failed) {
      console.error("\nQuality checks failed. Please fix issues before committing.");
      process.exit(1);
    }

    console.log("\nAll quality checks passed!");
  } catch (error) {
    const err = error as { message: string };
    console.error(`\nFatal error during quality check: ${err.message}`);
    process.exit(1);
  }
}

export { runCheck as run };

const isDirectRun = process.argv[1]?.endsWith("quality-staged.js") ?? false;

if (isDirectRun) {
  await runCheck();
}
