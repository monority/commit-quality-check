#!/usr/bin/env node
/**
 * Quick end-to-end scenario runner: builds a throwaway demo project,
 * installs the local package, and plays every user-facing scenario.
 * Usage: npm run scenarios [-- --keep]
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const keep = process.argv.includes("--keep");
const results = [];
const createdDirs = [];

function sh(cmd, args, cwd, opts = {}) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe", ...opts });
}

/** Run through the shell: required for .cmd shims (npm) on Windows. */
function shShell(command, cwd) {
  return execSync(command, { cwd, encoding: "utf8", stdio: "pipe" });
}

function shOk(cmd, args, cwd) {
  try {
    sh(cmd, args, cwd);
    return true;
  } catch {
    return false;
  }
}

function scenario(name, expect, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createDemoProject(withPackageJson = true) {
  const dir = mkdtempSync(join(tmpdir(), "cq-demo-"));
  createdDirs.push(dir);
  sh("git", ["init"], dir);
  sh("git", ["config", "user.email", "demo@demo.local"], dir);
  sh("git", ["config", "user.name", "Demo"], dir);
  if (withPackageJson) {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-app",
          version: "1.0.0",
          scripts: { lint: "echo lint ok", test: "echo tests ok" },
        },
        null,
        2,
      ),
    );
  }
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.js"), "function add(a, b) {\n  return a + b;\n}\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\nreports/\n*.tgz\n");
  sh("git", ["add", "."], dir);
  sh("git", ["commit", "-q", "-m", "chore: init"], dir);
  return dir;
}

const cli = (demo, args) => sh("node", [join(demo, "node_modules", "commit-quality-check", "dist", "scripts", "cli.js"), ...args], demo);
const cliOk = (demo, args) => shOk("node", [join(demo, "node_modules", "commit-quality-check", "dist", "scripts", "cli.js"), ...args], demo);

// 1. Pack and install the local package into the demo project.
console.log("Packing local package...");
const tarball = execSync("npm pack --silent", { cwd: repoRoot, encoding: "utf8" }).trim().split("\n").pop();
const demo = createDemoProject();
console.log(`Installing ${tarball}...`);
shShell(`npm install --force --no-audit --no-fund "${join(repoRoot, tarball)}"`, demo);

const staged = (demo, file, content) => {
  const target = join(demo, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  sh("git", ["add", file], demo);
};

// --- Scenarios ---

scenario("1. enable installs hooks and sets core.hooksPath", "pass", () => {
  cli(demo, ["enable"]);
  assert(existsSync(join(demo, ".husky", "pre-commit")), "pre-commit missing");
  assert(existsSync(join(demo, ".husky", "commit-msg")), "commit-msg missing");
  const hooksPath = sh("git", ["config", "--get", "core.hooksPath"], demo).trim();
  assert(hooksPath === ".husky", `hooksPath is ${hooksPath}`);
});

scenario("2. conventional commit is accepted", "pass", () => {
  staged(demo, "src/feature.js", "export const f = () => 1;\n");
  assert(shOk("git", ["commit", "-q", "-m", "feat: add feature"], demo), "commit rejected");
});

scenario("3. non-conventional message is rejected", "fail", () => {
  staged(demo, "src/other.js", "export const o = () => 2;\n");
  assert(!shOk("git", ["commit", "-q", "-m", "some random work"], demo), "bad message accepted");
  sh("git", ["reset", "-q"], demo);
});

scenario("4. gitmoji message is accepted", "pass", () => {
  staged(demo, "src/emoji.js", "export const e = () => 3;\n");
  assert(shOk("git", ["commit", "-q", "-m", ":art: format files"], demo), "gitmoji rejected");
});

scenario("5. secret in staged file is rejected", "fail", () => {
  // cq-disable secret - fake key fixture used by this scenario
  staged(demo, "config.js", 'const key = "sk-live-abcdef1234567890abcdef1234567890";\n');
  assert(!shOk("git", ["commit", "-q", "-m", "feat: add config"], demo), "secret accepted");
  sh("git", ["reset", "-q"], demo);
});

scenario("6. cq-disable secret silences the finding", "pass", () => {
  staged(demo, "config.js", '// cq-disable secret\nconst key = "sk-live-abcdef1234567890abcdef1234567890";\n');
  assert(shOk("git", ["commit", "-q", "-m", "feat: add config"], demo), "silenced secret rejected");
});

scenario("7. console.log at line start is rejected", "fail", () => {
  staged(demo, "src/dbg.js", "function f() {\n  console.log('debug');\n}\n");
  assert(!shOk("git", ["commit", "-q", "-m", "feat: add debug"], demo), "debug artifact accepted");
  sh("git", ["reset", "-q"], demo);
});

scenario("8. cq-disable debug silences the finding", "pass", () => {
  staged(demo, "src/dbg.js", "function f() {\n  // cq-disable debug\n  console.log('ok');\n}\n");
  assert(shOk("git", ["commit", "-q", "-m", "feat: add silenced log"], demo), "silenced debug rejected");
});

function setIgnoreConfig(demo, ignore) {
  const pkg = JSON.parse(readFileSync(join(demo, "package.json"), "utf8"));
  pkg.gitQuality = { ...pkg.gitQuality, ignore };
  writeFileSync(join(demo, "package.json"), JSON.stringify(pkg, null, 2));
}

scenario("9. gitQuality.ignore folder skips checks inside it", "pass", () => {
  setIgnoreConfig(demo, ["vendor/"]);
  staged(demo, "package.json", readFileSync(join(demo, "package.json"), "utf8"));
  // cq-disable secret - fake key fixture used by this scenario
  staged(demo, "vendor/key.js", 'const key = "sk-live-abcdef1234567890abcdef1234567890";\n');
  assert(shOk("git", ["commit", "-q", "-m", "feat: vendor assets"], demo), "ignored folder not skipped");
});

scenario("10. gitQuality.ignore glob skips matching script files", "pass", () => {
  setIgnoreConfig(demo, ["*.gen.js"]);
  staged(demo, "package.json", readFileSync(join(demo, "package.json"), "utf8"));
  staged(demo, "src/generated.gen.js", "function f() {\n  console.log('generated');\n}\n");
  assert(shOk("git", ["commit", "-q", "-m", "feat: generated code"], demo), "ignored glob not skipped");
});

scenario("11. gitignored file in the working tree is never scanned", "pass", () => {
  // Secret present in the working tree but gitignored and unstaged: only
  // staged files are checked, so the commit must pass.
  staged(demo, ".gitignore", "node_modules/\nreports/\n*.tgz\nsecret.local.js\n");
  staged(demo, "src/clean.js", "export const c = () => 6;\n");
  // cq-disable secret - fake key fixture used by this scenario
  writeFileSync(join(demo, "secret.local.js"), 'const key = "sk-live-abcdef1234567890abcdef1234567890";\n');
  assert(shOk("git", ["commit", "-q", "-m", "feat: clean change"], demo), "unstaged secret blocked the commit");
  sh("git", ["reset", "-q"], demo);
});

scenario("12. json-check prints a parseable CI payload", "pass", () => {
  const out = JSON.parse(cli(demo, ["json-check"]));
  assert(typeof out.scoreSummary?.globalScore === "number", "no globalScore");
  assert(typeof out.allSuccess === "boolean", "no allSuccess");
  assert(Array.isArray(out.results) && out.results.length > 0, "no results");
});

scenario("13. json-check --reporters writes sarif and json files", "pass", () => {
  staged(demo, "src/more.js", "export const m = () => 4;\n");
  const out = JSON.parse(cli(demo, ["json-check", "--reporters", "sarif,json", "--output", "reports"]));
  assert(existsSync(join(demo, "reports", "report.sarif")), "report.sarif missing");
  assert(existsSync(join(demo, "reports", "report.json")), "report.json missing");
  assert(out.reportFiles.length === 2, "reportFiles incomplete");
  sh("git", ["reset", "-q"], demo);
});

scenario("14. auto-push pushes to a remote after commit", "pass", () => {
  const remote = join(dirname(demo), `cq-demo-remote-${Date.now()}.git`);
  createdDirs.push(remote);
  execSync(`git init -q --bare "${remote}"`);
  sh("git", ["remote", "add", "origin", remote], demo);
  sh("git", ["push", "-q", "-u", "origin", "HEAD"], demo);
  const pkg = JSON.parse(readFileSync(join(demo, "package.json"), "utf8"));
  pkg.gitQuality = { autoPush: true };
  writeFileSync(join(demo, "package.json"), JSON.stringify(pkg, null, 2));
  cli(demo, ["enable"]);
  staged(demo, "src/pushed.js", "export const p = () => 5;\n");
  assert(shOk("git", ["commit", "-q", "-m", "feat: pushed by post-commit"], demo), "commit failed");
  const heads = sh("git", ["--git-dir", remote, "log", "--oneline", "-1"], demo);
  assert(heads.includes("pushed by post-commit"), "remote did not receive the commit");
});

scenario("15. disable removes every managed hook", "pass", () => {
  cli(demo, ["disable"]);
  assert(!existsSync(join(demo, ".husky", "pre-commit")), "pre-commit still present");
  assert(!existsSync(join(demo, ".husky", "post-commit")), "post-commit still present");
  assert(!shOk("git", ["config", "--get", "core.hooksPath"], demo), "hooksPath still set");
});

scenario("16. enable works without package.json", "pass", () => {
  const bare = createDemoProject(false);
  // npm needs a manifest to install; the runtime target is a repo without one.
  writeFileSync(join(bare, "package.json"), "{}");
  shShell(`npm install --no-save --force --no-audit --no-fund "${join(repoRoot, tarball)}"`, bare);
  rmSync(join(bare, "package.json"), { force: true });
  rmSync(join(bare, "package-lock.json"), { force: true });
  cli(bare, ["enable"]);
  assert(existsSync(join(bare, ".husky", "pre-commit")), "pre-commit missing");
});

// --- Summary ---
console.log("\nSCENARIO RESULTS");
let failures = 0;
for (const r of results) {
  const label = r.ok ? "[PASS]" : "[FAIL]";
  console.log(`  ${label} ${r.name}`);
  if (!r.ok) {
    failures++;
    console.log(`         ${r.error}`);
  }
}
console.log(`\n${results.length - failures}/${results.length} scenarios passed`);

if (keep) {
  console.log(`Demo projects kept: ${createdDirs.join(", ")}`);
} else {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
  rmSync(join(repoRoot, tarball), { force: true });
}
process.exit(failures > 0 ? 1 : 0);
