import { runCheck } from "../quality-staged.js";
import { runJsonCheck, shouldPrintTargetProject } from "./json-check.js";
import { parseReportOptions, runReport } from "./report.js";
import {
  configureChecks,
  createSuggestedCommit,
  runCommitMsg,
  runSingleCheckMenu,
  showJsonAnalysis,
  showStatus,
  showSuggestion,
} from "./menus.js";
import { projRoot } from "./project.js";

// Re-exports kept for backward compatibility with hooks.ts and cli.ts.
export { isAutoPushConfigured, saveAutoPushConfig } from "./project.js";
export { shouldPrintTargetProject };
export { parseJsonCheckArgs, resolveJsonCheckProfile } from "./json-check.js";
export { parseReportOptions, runReport };
export type { JsonCheckOptions } from "./json-check.js";
export type { ReportOptions } from "./report.js";

export async function executeAction(
  choice: string,
  arg: string | null = null,
  pauseAfter: boolean = true,
): Promise<void> {
  const { C, pauseForTTY } = await import("./ui.js");
  const { toggleHook, toggleAutoPush, enableHook, disableHook } = await import("./hooks.js");

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
