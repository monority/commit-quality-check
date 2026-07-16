import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WipCommitChecker } from "../src/checkers/WipCommitChecker.js";

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

test("WipCommitChecker fails for 'wip: ...' message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-lower-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "wip: working on auth");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
        assert.ok(result.message.includes("WIP"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker fails for 'WIP: ...' (uppercase)", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-upper-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "WIP: still working");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker fails for 'work in progress'", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-progress-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "work in progress: auth module");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker fails for 'temp' message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-temp-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "temp fix for now");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker fails for 'todo' message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-todo-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "todo: implement validation");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker fails for 'fixme' message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-fixme-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "fixme: handle edge case");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, false);
        assert.equal(result.status, "fail");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker passes for valid commit message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-valid-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "fix: resolve null pointer in handler");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker passes for conventional commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-wip-conv-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "feat(auth): add login endpoint");
        const checker = new WipCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("WipCommitChecker skips when no commit message", async () => {
    const checker = new WipCommitChecker();
    const result = await checker.run(createMockContext(null, process.cwd()));
    assert.equal(result.success, true);
    assert.equal(result.status, "skip");
});

test("WipCommitChecker has correct metadata", () => {
    const checker = new WipCommitChecker();
    assert.equal(checker.id, "wip-commit");
    assert.equal(checker.category, "message");
    assert.equal(checker.severity, "error");
});
