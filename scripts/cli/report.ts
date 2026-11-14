import {
  defaultReportFiles,
  dispatchReports,
  emitGithubAnnotations,
  splitReporterList,
} from "./dispatch.js";
import type { EngineOutcome } from "./dispatch.js";
import { detectPackageManager } from "../../src/utils/ProjectUtils.js";
import { getStagedFiles, projRoot, readProjectPackageFile } from "./project.js";

export interface ReportOptions {
  reporters?: string[];
  output?: string;
  fullProfile?: boolean;
  root?: string;
}

/** Parse `report` CLI args: `--reporters <list>`, `--output <file>`, `--full`, or a bare reporter list. */
export function parseReportOptions(arg: string | null): ReportOptions {
  const options: ReportOptions = { reporters: ["cli"] };
  if (!arg) return options;

  const valid = new Set(["json", "sarif", "markdown", "cli"]);
  const tokens = arg.split(/\s+/).filter(Boolean);
  let reporters: string[] | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--reporters" && i + 1 < tokens.length) {
      reporters = splitReporterList(tokens[++i]).filter((name: string) => valid.has(name));
    } else if (token === "--output" && i + 1 < tokens.length) {
      options.output = tokens[++i] as string;
    } else if (token === "--full") {
      options.fullProfile = true;
    } else if (!token.startsWith("--")) {
      // Bare comma-separated list (e.g. `cq report markdown,sarif`).
      const names = splitReporterList(token).filter((name: string) => valid.has(name));
      if (names.length > 0) reporters = names;
    }
  }

  if (reporters && reporters.length > 0) {
    options.reporters = reporters;
  }
  return options;
}

/** Run quality checks and write report files via the ReportDispatcher. */
export async function runReport(options: ReportOptions = {}): Promise<void> {
  const { C } = await import("./ui.js");
  const reporters = options.reporters || ["cli"];
  const root = options.root || projRoot;

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log(`${C.yellow}No staged files available${C.reset}`);
    return;
  }

  const projectPackage = await readProjectPackageFile();
  const packageManager = await detectPackageManager(root);
  const { createQualityEngine } = await import("../../src/index.js");
  const engine = createQualityEngine({
    root,
    projectPackage,
    packageManager,
    stagedFiles,
    quiet: true,
  });

  const profile = options.fullProfile ? "full" : "fast";
  const outcome = (await engine.run(profile)) as EngineOutcome;

  const files = defaultReportFiles(reporters, options.output);
  const writtenFiles = dispatchReports(outcome, reporters, files);

  for (const f of writtenFiles) {
    console.log(`${C.green}Report written: ${f}${C.reset}`);
  }

  emitGithubAnnotations(outcome);

  if (!outcome.allSuccess) {
    process.exitCode = 1;
  }
}
