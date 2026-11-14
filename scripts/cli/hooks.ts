import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { detectPackageManager, getProjectRoot } from "../../src/utils/ProjectUtils.js";
import { C } from "./ui.js";
import { isAutoPushConfigured, saveAutoPushConfig } from "./commands.js";

const projRoot: string = await getProjectRoot();

export const AUTO_PUSH_HOOKS = ["post-commit", "pre-push"];

function execPrefix(packageManager: string): string {
  return `${packageManager} exec --`;
}

/** Hook file contents, generated for the project's package manager. */
export function buildPreCommitHook(packageManager: string): string {
  return `#!/usr/bin/env sh\n${execPrefix(packageManager)} cq staged\n`;
}

export function buildCommitMsgHook(packageManager: string): string {
  return `#!/usr/bin/env sh\n${execPrefix(packageManager)} cq commit-msg "$1"\n`;
}

export function buildAutoPushHook(packageManager: string): string {
  return `#!/usr/bin/env sh\n${execPrefix(packageManager)} cq check && git push\n`;
}

/** Match a cq hook line generated for any supported package manager. */
function matchesCqHookLine(content: string, command: string): boolean {
  const normalized = content.replace(/\r\n/g, "\n");
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:npm|pnpm|yarn|bun) exec -- ${escaped}$`, "m").test(normalized);
}

export function isPreCommitHook(content: string): boolean {
  return matchesCqHookLine(content, "cq staged");
}

export function isCommitMsgHook(content: string): boolean {
  return matchesCqHookLine(content, 'cq commit-msg "$1"');
}

export function hasGitPush(content: string): boolean {
  return /\bgit\s+push\b/.test(content.replace(/\r\n/g, "\n"));
}

export function isManagedHooksPath(hooksPath: string): boolean {
  return hooksPath === ".husky" || hooksPath === ".husky/_";
}

export async function getGitHooksPath(): Promise<string> {
  try {
    const { stdout } = await execa("git", ["config", "--get", "core.hooksPath"], {
      cwd: projRoot,
    });
    return stdout.trim().replace(/\\/g, "/");
  } catch {
    return "";
  }
}

export async function setGitHooksPath(): Promise<void> {
  await execa("git", ["config", "core.hooksPath", ".husky"], { cwd: projRoot });
}

export async function unsetGitHooksPathIfManaged(): Promise<void> {
  const hooksPath = await getGitHooksPath();
  if (isManagedHooksPath(hooksPath)) {
    await execa("git", ["config", "--unset", "core.hooksPath"], { cwd: projRoot });
  }
}

export async function removeAutoPushHookIfSafe(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf8");
    const commandLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    const hasPush = commandLines.some((line) => /\bgit\s+push\b/.test(line));
    const cqRelated = commandLines.some(
      (line) => /\bcq\b/.test(line) || /\bhusky\b/.test(line) || /\bgit\s+push\b/.test(line),
    );

    if (hasPush && cqRelated) {
      await unlink(filePath);
      return true;
    }
  } catch {
    // ignore missing hooks
  }

  return false;
}

export async function removeAutoPushHooks(): Promise<boolean> {
  const huskyDir = join(projRoot, ".husky");
  let removed = false;

  for (const hookName of AUTO_PUSH_HOOKS) {
    const hookPath = join(huskyDir, hookName);
    removed = (await removeAutoPushHookIfSafe(hookPath)) || removed;
  }

  return removed;
}

export interface HookState {
  preCommit: boolean;
  commitMsg: boolean;
  autoPush: boolean;
  hooksPath: boolean;
  hooksPathValue: string;
  enabled: boolean;
  broken: boolean;
}

async function readHookContent(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function getHookState(): Promise<HookState> {
  const preCommitPath = join(projRoot, ".husky", "pre-commit");
  const commitMsgPath = join(projRoot, ".husky", "commit-msg");
  const autoPushPath = join(projRoot, ".husky", "post-commit");
  const preCommitContent = await readHookContent(preCommitPath);
  const commitMsgContent = await readHookContent(commitMsgPath);
  const preCommitValid = isPreCommitHook(preCommitContent);
  const commitMsgValid = isCommitMsgHook(commitMsgContent);
  const autoPushValid = hasGitPush(await readHookContent(autoPushPath));
  const hooksPath = await getGitHooksPath();
  const hooksPathValid = isManagedHooksPath(hooksPath);
  const enabled = preCommitValid && commitMsgValid && hooksPathValid;
  const broken = Boolean((preCommitContent || commitMsgContent) && !enabled);

  return {
    preCommit: preCommitValid,
    commitMsg: commitMsgValid,
    autoPush: autoPushValid,
    hooksPath: hooksPathValid,
    hooksPathValue: hooksPath,
    enabled,
    broken,
  };
}

export async function enableHook(): Promise<void> {
  const huskyDir = join(projRoot, ".husky");
  const preCommitPath = join(huskyDir, "pre-commit");
  const commitMsgPath = join(huskyDir, "commit-msg");
  const packageManager = await detectPackageManager(projRoot);

  await mkdir(huskyDir, { recursive: true });
  await writeFile(preCommitPath, buildPreCommitHook(packageManager), "utf8");
  await writeFile(commitMsgPath, buildCommitMsgHook(packageManager), "utf8");
  await chmod(preCommitPath, 0o755);
  await chmod(commitMsgPath, 0o755);
  await setGitHooksPath();
  const autoPushEnabled = await isAutoPushConfigured();
  const removedAutoPush = autoPushEnabled ? false : await removeAutoPushHooks();
  if (autoPushEnabled) {
    await enableAutoPushHook();
  }
  console.log(`${C.green}Hooks enabled${C.reset}`);
  if (removedAutoPush) {
    console.log(`${C.yellow}Removed auto-push hook${C.reset}`);
  }
}

export async function enableAutoPushHook(): Promise<void> {
  const huskyDir = join(projRoot, ".husky");
  const autoPushPath = join(huskyDir, "post-commit");
  const packageManager = await detectPackageManager(projRoot);

  await mkdir(huskyDir, { recursive: true });
  await writeFile(autoPushPath, buildAutoPushHook(packageManager), "utf8");
  await chmod(autoPushPath, 0o755);
}

export async function disableAutoPushHook(): Promise<boolean> {
  const postCommitPath = join(projRoot, ".husky", "post-commit");
  const prePushPath = join(projRoot, ".husky", "pre-push");
  const removedPostCommit = await removeAutoPushHookIfSafe(postCommitPath);
  const removedPrePush = await removeAutoPushHookIfSafe(prePushPath);
  return removedPostCommit || removedPrePush;
}

export async function toggleAutoPush(): Promise<void> {
  const enabled = await isAutoPushConfigured();
  const nextEnabled = !enabled;

  await saveAutoPushConfig(nextEnabled);

  if (nextEnabled) {
    await enableHook();
    await enableAutoPushHook();
    console.log(`${C.green}Auto-push enabled${C.reset}`);
  } else {
    await disableAutoPushHook();
    console.log(`${C.green}Auto-push disabled${C.reset}`);
  }
}

export async function toggleHook(): Promise<void> {
  const hookState = await getHookState();
  if (hookState.enabled) {
    await disableHook();
  } else {
    await enableHook();
  }
}

export async function disableHook(): Promise<void> {
  const preCommitPath = join(projRoot, ".husky", "pre-commit");
  const commitMsgPath = join(projRoot, ".husky", "commit-msg");
  let removed = false;

  try {
    await unlink(preCommitPath);
    removed = true;
  } catch {
    // ignore
  }

  try {
    await unlink(commitMsgPath);
    removed = true;
  } catch {
    // ignore
  }

  await unsetGitHooksPathIfManaged();

  console.log(removed ? `${C.green}Hooks disabled${C.reset}` : `${C.yellow}Already off${C.reset}`);
}
