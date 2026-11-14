import { execa } from "execa";
import { CommitMsgChecker } from "../../src/checkers/CommitMsgChecker.js";
import { formatSuggestionSummary, runCheck } from "../quality-staged.js";
import type { ChecklistItem, KeypressKey } from "./ui.js";
import {
  buildJsonAnalysisPayload,
  formatStatusAnalysis,
  getAvailableCheckers,
  getSkippedChecks,
  getStatusAnalysis,
  projRoot,
  saveSkippedChecks,
} from "./project.js";

const CONFIGURE_HINT = "Arrows move  SPACE toggle  ENTER save  Q cancel";
const SINGLE_HINT = "Arrows move  ENTER run selected check  Q cancel";

function isCancelKey(key: KeypressKey): boolean {
  return key?.name === "q" || (key?.ctrl && key?.name === "c") || key?.name === "escape";
}

function isEnterKey(key: KeypressKey): boolean {
  return key?.name === "return" || key?.name === "enter";
}

/** Shared keypress loop for arrow-key checklists. `onEnter` receives the final cursor. */
async function runChecklist(
  title: string,
  items: ChecklistItem[],
  hint: string,
  drawChecklist: (title: string, items: ChecklistItem[], cursor: number, hint: string) => void,
  setRawMode: (enabled: boolean) => void,
  onEnter: (cursor: number) => Promise<void>,
  onCancelled: () => void,
): Promise<void> {
  const readline = (await import("node:readline")).default;
  let cursor = 0;

  drawChecklist(title, items, cursor, hint);

  await new Promise<void>((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const onKey = async (_: string, key: KeypressKey) => {
      if (key?.name === "up") {
        cursor = Math.max(0, cursor - 1);
        drawChecklist(title, items, cursor, hint);
        return;
      }

      if (key?.name === "down") {
        cursor = Math.min(items.length - 1, cursor + 1);
        drawChecklist(title, items, cursor, hint);
        return;
      }

      if (key?.name === "space") {
        items[cursor]!.enabled = !items[cursor]!.enabled;
        drawChecklist(title, items, cursor, hint);
        return;
      }

      if (isEnterKey(key)) {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        try {
          await onEnter(cursor);
        } finally {
          resolve();
        }
        return;
      }

      if (isCancelKey(key)) {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        resolve();
        onCancelled();
      }
    };

    process.stdin.on("keypress", onKey);
    setRawMode(true);
  });
}

export async function configureChecks(): Promise<void> {
  const { C, drawChecklist, setRawMode } = await import("./ui.js");

  if (!process.stdin.isTTY) {
    console.log("Interactive check configuration requires a TTY.");
    return;
  }

  const checkers = await getAvailableCheckers();
  const skipSet = await getSkippedChecks();
  const items: ChecklistItem[] = checkers.map((checker) => ({
    ...checker,
    enabled: !skipSet.has(checker.name),
  }));

  await runChecklist(
    "CONFIGURE CHECKS",
    items,
    CONFIGURE_HINT,
    drawChecklist,
    setRawMode,
    async () => {
      const nextSkipSet = new Set<string>(
        items.filter((item) => !item.enabled).map((item) => item.name),
      );
      await saveSkippedChecks(nextSkipSet);
      console.log(`${C.green}Check configuration saved${C.reset}`);
    },
    () => {
      console.log(`${C.yellow}Check configuration cancelled${C.reset}`);
    },
  );
}

export async function runSingleCheckMenu(rootOverride: string | null = null): Promise<void> {
  const { C, drawChecklist, setRawMode } = await import("./ui.js");

  if (!process.stdin.isTTY) {
    console.log("Interactive single-check mode requires a TTY.");
    return;
  }

  const checkers = await getAvailableCheckers();
  const items: ChecklistItem[] = checkers.map((checker) => ({ ...checker, enabled: true }));

  await runChecklist(
    "RUN SINGLE CHECK",
    items,
    SINGLE_HINT,
    drawChecklist,
    setRawMode,
    async (cursor) => {
      const selectedChecker = checkers[cursor]!;
      await runCheck({
        fullProfile: selectedChecker.profile === "full",
        onlyCheckNames: [selectedChecker.name],
        root: rootOverride || projRoot,
      });
    },
    () => {
      console.log(`${C.yellow}Single check cancelled${C.reset}`);
    },
  );
}

export async function runCommitMsg(commitMsgPath: string | null): Promise<void> {
  const checker = new CommitMsgChecker();
  // CommitMsgChecker.run() accepts a context-like object with root + commitMsgPath
  const ctx = { root: projRoot, commitMsgPath } as unknown as Parameters<
    InstanceType<typeof CommitMsgChecker>["run"]
  >[0];
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
