#!/usr/bin/env node
import { executeAction, shouldPrintTargetProject, runReport } from "./cli/commands.js";
import { runMenu } from "./cli/ui.js";
import { C } from "./cli/ui.js";

export interface CliFlags {
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseCliFlags(argv: string[]): CliFlags {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  // Only parse top-level flags (before the first positional command)
  let foundCommand = false;
  const commandValues = new Set([
    "toggle", "enable", "disable", "status", "suggest", "json", "staged",
    "check", "config", "single", "auto-push", "menu", "commit", "json-check",
    "commit-msg", "report",
    "t", "e", "d", "s", "u", "j", "f", "c", "g", "r", "p", "m",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!foundCommand && !arg!.startsWith('--') && commandValues.has(arg!)) {
      foundCommand = true;
      positional.push(arg!);
      // Rest are positional (including flags for subcommands)
      for (let j = i + 1; j < argv.length; j++) {
        positional.push(argv[j]!);
      }
      break;
    }
    if (arg!.startsWith('--') && !foundCommand) {
      const eqIdx = arg!.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg!.slice(2, eqIdx);
        const val = arg!.slice(eqIdx + 1);
        flags[key] = val;
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        const val = argv[i + 1]!;
        flags[arg!.slice(2)] = val;
        i++;
      } else {
        flags[arg!.slice(2)] = true;
      }
    } else if (!foundCommand) {
      foundCommand = true;
      positional.push(arg!);
      for (let j = i + 1; j < argv.length; j++) {
        positional.push(argv[j]!);
      }
      break;
    }
  }
  return { flags, positional };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { flags, positional } = parseCliFlags(rawArgs);

  // Handle report-related flags: --json, --markdown, --sarif, --reporters, --output
  const reportFlags: string[] = [];
  if (flags.json) reportFlags.push('json');
  if (flags.markdown) reportFlags.push('markdown');
  if (flags.sarif) reportFlags.push('sarif');
  if (flags.reporters) {
    const extra = (flags.reporters as string).split(',').map((s: string) => s.trim());
    for (const r of extra) {
      if (!reportFlags.includes(r)) reportFlags.push(r);
    }
  }
  if (reportFlags.length > 0) {
    const reportOpts: { reporters: string[]; fullProfile?: boolean; output?: string } = {
      reporters: reportFlags,
      fullProfile: flags.full === true,
    };
    if (flags.output) {
      reportOpts.output = flags.output as string;
    }
    await runReport(reportOpts);
    return;
  }

  const cmd = positional[0];
  const arg = positional[1] ?? null;

  // AI provider override via --ai flag
  if (flags.ai) {
    if (!process.env.CQ_AI_PROVIDER) {
      process.env.CQ_AI_PROVIDER = String(flags.ai);
    }
  }

  const commandMap: Record<string, string> = {
    t: "toggle",
    e: "enable",
    d: "disable",
    s: "status",
    u: "suggest",
    j: "json",
    f: "staged",
    c: "check",
    g: "config",
    r: "single",
    p: "auto-push",
    m: "menu",
    commit: "commit",
    json: "json",
    "json-check": "json-check",
    suggest: "suggest",
    "auto-push": "auto-push",
    "commit-msg": "commit-msg",
    report: "report",
  };

  if (!cmd) return;
  const initialChoice = commandMap[cmd!] || cmd!;

  if (shouldPrintTargetProject(initialChoice, arg)) {
    console.log(`${C.cyan}Target project: ${arg}${C.reset}`);
  }

  if (initialChoice && initialChoice !== "menu") {
    await executeAction(initialChoice, arg, false);
    return;
  }

  let choice = "menu";
  while (choice !== "quit") {
    if (choice === "menu") {
      choice = await runMenu();
    } else {
      await executeAction(choice, arg);
      choice = "menu";
    }
  }

  console.log(`${C.magenta}Bye!${C.reset}`);
}

await main();
