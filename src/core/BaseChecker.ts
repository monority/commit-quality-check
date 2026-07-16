import type { CheckResult, CheckerCategory, CheckerSeverity, ProjectConfig } from '../types.js';
import { execa } from "execa";

export interface ProjectContext extends ProjectConfig {
  config?: Record<string, unknown>;
}

export class BaseChecker {
  name: string;
  profile: string;
  id?: string;
  category?: CheckerCategory;
  severity?: CheckerSeverity;
  description?: string;

  constructor(name: string, profile: string = "fast") {
    if (this.constructor === BaseChecker) {
      throw new Error("BaseChecker is an abstract class and cannot be instantiated directly.");
    }
    this.name = name;
    this.profile = profile;
  }

  async run(_context: ProjectContext): Promise<CheckResult> {
    throw new Error(`Method 'run()' must be implemented by subclass ${this.constructor.name}`);
  }

  async exec(context: ProjectContext, command: string, args: string[] = [], options: Record<string, unknown> = {}): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const { root } = context;

    try {
      const result = await execa(command, args, {
        cwd: root,
        stdio: "pipe",
        ...options,
      });
      return {
        success: true,
        stdout: result.stdout?.trim() || "",
        stderr: result.stderr?.trim() || "",
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message: string };
      return {
        success: false,
        stdout: err.stdout?.trim() || "",
        stderr: err.stderr?.trim() || err.message,
      };
    }
  }

  async getStagedFiles(context: ProjectContext): Promise<string[]> {
    if (Array.isArray(context?.stagedFiles)) {
      return context.stagedFiles.filter((file) => !this.isIgnoredFile(file, context));
    }

    const { root } = context;
    try {
      const { stdout } = await execa(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        { cwd: root },
      );
      return stdout
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
        .filter((file) => !this.isIgnoredFile(file, context));
    } catch (error) {
      const err = error as { message: string };
      console.error(`❌ Failed to get staged files: ${err.message}`);
      return [];
    }
  }

  isIgnoredFile(file: string, context: ProjectContext): boolean {
    const ignorePatterns = (context.config?.ignore as string[] | undefined) || [];
    if (ignorePatterns.length === 0) return false;

    const normalizedFile = normalizePath(file);
    return ignorePatterns.some((pattern) =>
      matchesIgnorePattern(normalizedFile, pattern),
    );
  }

  getPackageManagerScriptCommand(packageManager: string, script: string, extraArgs: string[] = []): { command: string; args: string[] } {
    switch (packageManager) {
      case "pnpm":
        return { command: "pnpm", args: ["run", script, "--", ...extraArgs] };
      case "yarn":
        return { command: "yarn", args: ["run", script, ...extraArgs] };
      case "bun":
        return { command: "bun", args: ["run", script, ...extraArgs] };
      default:
        return { command: "npm", args: ["run", script, "--", ...extraArgs] };
    }
  }

  async runScript(context: ProjectContext, script: string, extraArgs: string[] = []): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const { packageManager } = context;
    const { command, args } = this.getPackageManagerScriptCommand(
      packageManager,
      script,
      extraArgs,
    );
    return this.exec(context, command, args);
  }

  async checkDependencies(context: ProjectContext, dependencies: string[]): Promise<{ installed: boolean; command: string }> {
    const { packageManager, projectPackage } = context;
    const pkg = projectPackage as Record<string, unknown> | undefined;
    const hasDependency = (dep: string): boolean =>
      Boolean(
        (pkg?.dependencies as Record<string, unknown>)?.[dep] ||
        (pkg?.devDependencies as Record<string, unknown>)?.[dep] ||
        (pkg?.peerDependencies as Record<string, unknown>)?.[dep],
      );

    if (dependencies.every(hasDependency)) {
      return { installed: true, command: "" };
    }

    return {
      installed: false,
      command: this.getInstallCommand(packageManager, dependencies),
    };
  }

  getInstallCommand(packageManager: string, dependencies: string[]): string {
    const deps = dependencies.join(" ");
    switch (packageManager) {
      case "pnpm": return `pnpm add -D ${deps}`;
      case "yarn": return `yarn add -D ${deps}`;
      case "bun": return `bun add -d ${deps}`;
      default: return `npm install --save-dev ${deps}`;
    }
  }
}

function normalizePath(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
}

function matchesIgnorePattern(file: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern) return false;

  if (hasGlob(normalizedPattern)) {
    const target = normalizedPattern.includes("/")
      ? file
      : (file.split("/").pop() ?? "");
    return globToRegExp(normalizedPattern).test(target);
  }

  const directoryPattern = normalizedPattern.endsWith("/")
    ? normalizedPattern.slice(0, -1)
    : normalizedPattern;

  return file === directoryPattern || file.startsWith(`${directoryPattern}/`);
}

function hasGlob(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("")
    .map((char) => {
      if (char === "*") return "[^/]*";
      if (char === "?") return "[^/]";
      return char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    })
    .join("");

  return new RegExp(`^${escaped}$`);
}
