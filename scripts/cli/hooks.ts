import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { getProjectRoot } from "../../src/utils/ProjectUtils.js";
import { C } from "./ui.js";
import { isAutoPushConfigured, saveAutoPushConfig } from "./commands.js";

const projRoot: string = await getProjectRoot();

export const PRE_COMMIT_HOOK = "#!/usr/bin/env sh\nnpm exec -- cq staged\n";
export const COMMIT_MSG_HOOK = "#!/usr/bin/env sh\nnpm exec -- cq commit-msg \"$1\"\n";
export const AUTO_PUSH_HOOK = "#!/usr/bin/env sh\nnpm exec -- cq check && git push\n";
export const PRE_COMMIT_COMMAND = "npm exec -- cq staged";
export const COMMIT_MSG_COMMAND = "npm exec -- cq commit-msg \"$1\"";
export const AUTO_PUSH_COMMAND = "git push";
export const AUTO_PUSH_HOOKS = ["post-commit", "pre-push"];

export async function hasHookCommand(filePath: string, expectedCommand: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.replace(/\r\n/g, "\n").includes(expectedCommand);
  } catch {
    return false;
  }
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
    const cqRelated = commandLines.some((line) =>
      /\bcq\b/.test(line) || /\bhusky\b/.test(line) || /\bgit\s+push\b/.test(line),
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
    removed = await removeAutoPushHookIfSafe(hookPath) || removed;
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

export async function getHookState(): Promise<HookState> {
  const preCommitPath = join(projRoot, ".husky", "pre-commit");
  const commitMsgPath = join(projRoot, ".husky", "commit-msg");
  const autoPushPath = join(projRoot, ".husky", "post-commit");
  const preCommitExists = existsSync(preCommitPath);
  const commitMsgExists = existsSync(commitMsgPath);
  const preCommitValid = await hasHookCommand(preCommitPath, PRE_COMMIT_COMMAND);
  const commitMsgValid = await hasHookCommand(commitMsgPath, COMMIT_MSG_COMMAND);
  const autoPushValid = await hasHookCommand(autoPushPath, AUTO_PUSH_COMMAND);
  const hooksPath = await getGitHooksPath();
  const hooksPathValid = isManagedHooksPath(hooksPath);
  const enabled = preCommitValid && commitMsgValid && hooksPathValid;
  const broken = (preCommitExists || commitMsgExists) && !enabled;

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

  await mkdir(huskyDir, { recursive: true });
  await writeFile(preCommitPath, PRE_COMMIT_HOOK, "utf8");
  await writeFile(commitMsgPath, COMMIT_MSG_HOOK, "utf8");
  await chmod(preCommitPath, 0o755);
  await chmod(commitMsgPath, 0o755);
  await setGitHooksPath();
  const autoPushEnabled = await isAutoPushConfigured();
  const removedAutoPush = autoPushEnabled
    ? false
    : await removeAutoPushHooks();
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

  await mkdir(huskyDir, { recursive: true });
  await writeFile(autoPushPath, AUTO_PUSH_HOOK, "utf8");
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

  console.log(
    removed ? `${C.green}Hooks disabled${C.reset}` : `${C.yellow}Already off${C.reset}`,
  );
}

