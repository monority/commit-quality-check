import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { ConventionalCommitChecker } from "../src/checkers/ConventionalCommitChecker.js";

import type { ProjectContext } from "../src/core/BaseChecker.js";

function createMockContext(commitMsgPath: string | null, root?: string): ProjectContext {
    return {
        root: root || process.cwd(),
        commitMsgPath,
        config: {},
        stagedFiles: [],
        stagedDiff: "",
    } as ProjectContext;
}

test("ConventionalCommitChecker passes for valid feat message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-conv-feat-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "feat(auth): add login endpoint");
        const checker = new ConventionalCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConventionalCommitChecker passes for valid fix message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-conv-fix-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "fix(api): resolve null pointer in handler");
        const checker = new ConventionalCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConventionalCommitChecker passes for breaking change", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-conv-breaking-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "refactor(core)!: remove deprecated API");
        const checker = new ConventionalCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConventionalCommitChecker passes for all valid types", async () => {
    const types = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
    for (const type of types) {
        const root = await mkdtemp(join(tmpdir(), `cq-conv-${type}-`));
        try {
            const msgPath = join(root, "COMMIT_MSG");
            await writeFile(msgPath, `${type}: test message`);
            const checker = new ConventionalCommitChecker();
            const result = await checker.run(createMockContext(msgPath, root));
            assert.equal(result.success, true, `Type "${type}" should pass`);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});

test("ConventionalCommitChecker fails for invalid message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-conv-invalid-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "updated some stuff");
        const checker = new ConventionalCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
        assert.ok(result.message.includes("Conventional Commits"));
        assert.ok(Array.isArray(result.penalties));
        assert.equal(result.penalties.length, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConventionalCommitChecker fails for invalid type", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-conv-badtype-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "update: changed something");
        const checker = new ConventionalCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
        assert.ok(result.message.includes('"update"'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConventionalCommitChecker skips when no commit message", async () => {
    const checker = new ConventionalCommitChecker();
    const result = await checker.run(createMockContext(null, process.cwd()));
    assert.equal(result.success, true);
    assert.equal(result.status, "skip");
});

test("ConventionalCommitChecker has correct metadata", () => {
    const checker = new ConventionalCommitChecker();
    assert.equal(checker.id, "conventional-commit");
    assert.equal(checker.category, "message");
    assert.equal(checker.severity, "error");
    assert.ok(checker.description.length > 0);
});
