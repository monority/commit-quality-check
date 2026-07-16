import readline from "node:readline";
import type { DiffAnalysis, ScoreSummary, SuggestionSummary } from "../../src/types.js";

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface ColorCodes {
  reset: string;
  bright: string;
  green: string;
  yellow: string;
  cyan: string;
  magenta: string;
  red: string;
}

export const C: ColorCodes = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

export interface MenuOption {
  label: string;
  action: string;
}

export const options: MenuOption[] = [
  { label: "Toggle hook", action: "toggle" },
  { label: "Toggle auto-push", action: "auto-push" },
  { label: "Configure checks", action: "config" },
  { label: "Run single check", action: "single" },
  { label: "Status", action: "status" },
  { label: "Suggest commit", action: "suggest" },
  { label: "Commit", action: "commit" },
  { label: "Staged check", action: "staged" },
  { label: "Full check", action: "check" },
  { label: "Quit", action: "quit" },
];

let selected: number = 0;

export function setRawMode(enable: boolean): void {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(enable);
  }
  if (enable) {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
  } else {
    process.stdin.pause();
  }
}

export async function pauseForTTY(): Promise<void> {
  if (!process.stdin.isTTY) return;
  console.log(`\n${C.yellow}Press any key to return to menu...${C.reset}`);
  await new Promise<void>((resolve) => {
    const onData = () => {
      process.stdin.removeListener("data", onData);
      setRawMode(false);
      resolve();
    };
    process.stdin.once("data", onData);
    setRawMode(true);
  });
}

export interface ChecklistItem {
  name: string;
  enabled: boolean;
  profile?: string;
}

export function drawChecklist(
  title: string,
  items: ChecklistItem[],
  cursor: number,
  instructions: string,
): void {
  console.clear();
  console.log(`\n${C.cyan}${C.bright}${title}${C.reset}\n`);

  items.forEach((item, index) => {
    const isSelected = index === cursor;
    const arrow = isSelected ? `${C.yellow}>${C.reset}` : " ";
    const marker = item.enabled ? `${C.green}[x]${C.reset}` : `${C.red}[ ]${C.reset}`;
    const profile = item.profile === "full"
      ? `${C.yellow}(full)${C.reset}`
      : `${C.green}(fast)${C.reset}`;
    const label = isSelected
      ? `${C.bright}${C.cyan}${item.name}${C.reset}`
      : item.name;
    console.log(`  ${arrow} ${marker} ${label} ${profile}`);
  });

  console.log(`\n${C.magenta}${instructions}${C.reset}`);
}

export async function drawMenu(): Promise<void> {
  const { getHookState } = await import("./hooks.js");
  const hookState = await getHookState();
  console.clear();
  console.log(`\n${C.cyan}${C.bright}COMMIT QUALITY CHECK${C.reset}\n`);

  options.forEach((opt, index) => {
    const isSelected = index === selected;
    const label = isSelected
      ? `${C.bright}${C.cyan}${opt.label}${C.reset}`
      : opt.label;
    let status = "";

    if (opt.action === "toggle") {
      if (hookState.enabled) status = ` ${C.green}ON${C.reset}`;
      else if (hookState.broken) status = ` ${C.yellow}BROKEN${C.reset}`;
      else status = ` ${C.red}OFF${C.reset}`;
    }

    if (opt.action === "auto-push") {
      status = hookState.autoPush ? ` ${C.green}ON${C.reset}` : ` ${C.red}OFF${C.reset}`;
    }

    const arrow = isSelected ? `${C.yellow}>${C.reset}` : " ";
    console.log(`  ${arrow} ${label}${status}`);
  });

  console.log(`\n${C.magenta}Use arrows, Enter, Q${C.reset}`);
}

export async function runMenu(): Promise<string> {

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("Interactive menu requires a TTY terminal.");
    console.log("Use: cq status | cq suggest | cq json | cq json-check");
    process.exit(1);
  }

  await drawMenu();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("Interactive menu requires a TTY terminal.");
    console.log("Use: cq status | cq suggest | cq json | cq json-check");
    process.exit(1);
  }


  return new Promise<string>((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const onKey = async (_: string, key: KeypressKey) => {
      if (key?.name === "up") {
        selected = Math.max(0, selected - 1);
        await drawMenu();
        return;
      }

      if (key?.name === "down") {
        selected = Math.min(options.length - 1, selected + 1);
        await drawMenu();
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        resolve(options[selected]!.action);
        return;
      }

      if (key?.name === "q" || (key?.ctrl && key?.name === "c")) {
        process.stdin.removeListener("keypress", onKey);
        setRawMode(false);
        console.clear();
        resolve("quit");
      }
    };

    process.stdin.on("keypress", onKey);
    setRawMode(true);
  });
}

export interface StatusAnalysis {
  analysis: DiffAnalysis | null;
  stagedFiles: string[];
  scoreSummary: ScoreSummary | null;
  suggestionSummary: SuggestionSummary | null;
}

export async function promptCommitMessage(
  statusAnalysis: StatusAnalysis,
  suggestedHeader: string,
): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return suggestedHeader;
  }

  const { formatSuggestionSummary } = await import("../quality-staged.js");
  const suggestionBlock = formatSuggestionSummary(statusAnalysis.suggestionSummary).trim();
  if (suggestionBlock) {
    console.log(suggestionBlock);
  }

  console.log(`${C.cyan}Enter to accept, type custom message, or q to cancel${C.reset}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Commit message: ", resolve);
  });
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed) {
    return suggestedHeader;
  }

  if (["q", "quit", "cancel"].includes(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}