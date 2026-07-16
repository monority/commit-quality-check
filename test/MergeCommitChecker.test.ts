import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MergeCommitChecker } from "../src/checkers/MergeCommitChecker.js";

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

test("MergeCommitChecker detects merge commit message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-merge-detect-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "Merge branch 'feature/auth' into main");
        const checker = new MergeCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
        assert.ok(result.message.includes("Merge"));
        assert.ok(result.message.includes("rebase"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("MergeCommitChecker passes for normal commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-merge-normal-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "feat(auth): add login endpoint");
        const checker = new MergeCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
        assert.ok(result.message.includes("Not a merge commit"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("MergeCommitChecker passes for 'Merge pull request' message", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-merge-pr-"));
    try {
        const msgPath = join(root, "COMMIT_MSG");
        await writeFile(msgPath, "Merge pull request #42 from feature/auth");
        const checker = new MergeCommitChecker();
        const result = await checker.run(createMockContext(msgPath, root));
        assert.equal(result.success, true);
        assert.equal(result.status, "pass");
        assert.ok(result.message.includes("Merge"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("MergeCommitChecker skips when no commit message", async () => {
    const checker = new MergeCommitChecker();
    const result = await checker.run(createMockContext(null, process.cwd()));
    assert.equal(result.success, true);
    assert.equal(result.status, "skip");
});

test("MergeCommitChecker has correct metadata", () => {
    const checker = new MergeCommitChecker();
    assert.equal(checker.id, "merge-commit");
    assert.equal(checker.category, "history");
    assert.equal(checker.severity, "info");
});
