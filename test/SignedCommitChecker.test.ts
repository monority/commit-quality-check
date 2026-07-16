import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { SignedCommitChecker } from "../src/checkers/SignedCommitChecker.js";

import type { ProjectContext } from "../src/core/BaseChecker.js";

function createMockContext(root: string): ProjectContext {
    return {
        root,
        config: {},
        stagedFiles: [],
        stagedDiff: "",
    } as ProjectContext;
}

test("SignedCommitChecker skips when GPG not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-signed-no-gpg-"));
    try {
        await execa("git", ["init"], { cwd: root });
        const checker = new SignedCommitChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "skip");
        assert.ok(result.message.includes("skipped") || result.message.includes("not configured"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("SignedCommitChecker passes when GPG signing enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-signed-enabled-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["config", "commit.gpgsign", "true"], { cwd: root });
        const checker = new SignedCommitChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
        assert.ok(result.message.includes("GPG signed") || result.message.includes("configured"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("SignedCommitChecker fails when GPG signing explicitly disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-signed-disabled-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["config", "commit.gpgsign", "false"], { cwd: root });
        const checker = new SignedCommitChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
        assert.ok(result.message.includes("not enabled") || result.message.includes("not true"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("SignedCommitChecker has correct metadata", () => {
    const checker = new SignedCommitChecker();
    assert.equal(checker.id, "signed-commit");
    assert.equal(checker.category, "workflow");
    assert.equal(checker.severity, "warning");
});
