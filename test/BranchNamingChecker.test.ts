import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { BranchNamingChecker } from "../src/checkers/BranchNamingChecker.js";

import type { ProjectContext } from "../src/core/BaseChecker.js";

function createMockContext(root: string, config: Record<string, unknown> = {}): ProjectContext {
    return {
        root,
        config: { ...config },
        stagedFiles: [],
        stagedDiff: "",
    } as ProjectContext;
}

test("BranchNamingChecker passes for valid feature branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-feature-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["checkout", "-b", "feature/add-auth"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
        assert.ok(result.message.includes("feature/add-auth"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker passes for valid fix branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-fix-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["checkout", "-b", "fix/login-bug"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker fails for invalid branch name", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-invalid-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["checkout", "-b", "FOO-123"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
        assert.ok(result.message.includes("FOO-123"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker fails for branch without prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-noprefix-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["checkout", "-b", "my-cool-branch"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker skips for default branch (main)", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-main-"));
    try {
        await execa("git", ["init", "-b", "main"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "skip");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker skips for default branch (master)", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-master-"));
    try {
        await execa("git", ["init", "-b", "master"], { cwd: root });
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root));
        assert.equal(result.success, true);
        assert.equal(result.status, "skip");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker uses custom pattern from config", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-branch-custom-"));
    try {
        await execa("git", ["init"], { cwd: root });
        await execa("git", ["checkout", "-b", "JIRA-123"], { cwd: root });
        const config = {
            rules: { branch_pattern: "^[A-Z]+-\\d+$" },
        };
        const checker = new BranchNamingChecker();
        const result = await checker.run(createMockContext(root, config));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("BranchNamingChecker has correct metadata", () => {
    const checker = new BranchNamingChecker();
    assert.equal(checker.id, "branch-naming");
    assert.equal(checker.category, "workflow");
    assert.equal(checker.severity, "warning");
});
