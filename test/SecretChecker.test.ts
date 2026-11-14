import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { SecretChecker } from "../src/checkers/SecretChecker.js";
import type { ProjectContext } from "../src/core/BaseChecker.js";

async function initRepo(root: string): Promise<void> {
  await execa("git", ["init"], { cwd: root });
  await execa("git", ["config", "user.email", "cq@example.com"], { cwd: root });
  await execa("git", ["config", "user.name", "CQ"], { cwd: root });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "tmp", version: "1.0.0" }));
}

test("fails when staged file contains a secret", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-secret-detect-"));
  const checker = new SecretChecker();

  try {
    await initRepo(root);
    await writeFile(
      join(root, "app.js"),
      // cq-disable secret — fake key used by this test
      'const key = "sk-live-abcdef1234567890abcdef1234567890";\n',
    );
    await execa("git", ["add", "."], { cwd: root });

    const result = await checker.run({ root, packageManager: "npm" } as ProjectContext);

    assert.equal(result.success, false);
    assert.match(result.message, /Secrets detected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cq-disable secret on the previous line silences the finding", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-secret-disable-"));
  const checker = new SecretChecker();

  try {
    await initRepo(root);
    await writeFile(
      join(root, "app.js"),
      '// cq-disable secret\nconst key = "sk-live-abcdef1234567890abcdef1234567890";\n',
    );
    await execa("git", ["add", "."], { cwd: root });

    const result = await checker.run({ root, packageManager: "npm" } as ProjectContext);

    assert.equal(result.success, true);
    assert.equal(result.message, "No secrets detected");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detects a hardcoded GitHub token value", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-secret-gh-"));
  const checker = new SecretChecker();

  try {
    await initRepo(root);
    await writeFile(
      join(root, "ci.yml"),
      // cq-disable secret — fake token fixture used by this test
      'GITHUB_TOKEN: "ghp_AbcdEfGh1234567890AbcdEfGh1234567890"\n',
    );
    await execa("git", ["add", "."], { cwd: root });

    const result = await checker.run({ root, packageManager: "npm" } as ProjectContext);

    assert.equal(result.success, false);
    assert.match(result.message, /GitHub Token/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not flag a github-token input key without a literal value", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-secret-gh-input-"));
  const checker = new SecretChecker();

  try {
    await initRepo(root);
    await writeFile(join(root, "action.yml"), "github-token:\n  default: ${{ github.token }}\n");
    await execa("git", ["add", "."], { cwd: root });

    const result = await checker.run({ root, packageManager: "npm" } as ProjectContext);

    assert.equal(result.success, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
