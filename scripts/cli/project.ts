import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProjectContext } from "../../src/core/ProjectContext.js";
import { createQualityEngine } from "../../src/index.js";
import {
  detectPackageManager,
  getProjectRoot,
  listStagedFiles,
} from "../../src/utils/ProjectUtils.js";
import type { ColorCodes } from "./ui.js";
import type { DiffAnalysis, ScoreSummary, SuggestionSummary } from "../../src/types.js";

export const projRoot: string = await getProjectRoot();
const packageJsonPath = join(projRoot, "package.json");

export async function readProjectPackageFile(): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(packageJsonPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") return {};
    throw error;
  }
  const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(clean) as Record<string, unknown>;
}

export async function writeProjectPackageFile(
  projectPackage: Record<string, unknown>,
): Promise<void> {
  await writeFile(packageJsonPath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");
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
  return listStagedFiles(projRoot);
}

export interface StatusAnalysis {
  analysis: DiffAnalysis | null;
  stagedFiles: string[];
  scoreSummary: ScoreSummary | null;
  suggestionSummary: SuggestionSummary | null;
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
