import test from "node:test";
import assert from "node:assert/strict";
import { CommitSizeChecker } from "../src/checkers/CommitSizeChecker.js";

import type { ProjectContext } from "../src/core/BaseChecker.js";

function createMockContext(stagedDiff: string, config: Record<string, unknown> = {}): ProjectContext {
    return {
        root: process.cwd(),
        config: { ...config },
        stagedFiles: [],
        stagedDiff: stagedDiff || "",
    } as ProjectContext;
}

test("CommitSizeChecker passes when under threshold", async () => {
    const diff = Array(100).fill("+console.log('test');").join("\n");
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(diff));
    assert.equal(result.success, true);
    assert.equal(result.status, "pass");
    assert.ok(result.message.includes("100"));
});

test("CommitSizeChecker passes when exactly at threshold", async () => {
    const diff = Array(500).fill("+line;").join("\n");
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(diff));
    assert.equal(result.success, true);
    assert.equal(result.status, "pass");
});

test("CommitSizeChecker warns when over default threshold", async () => {
    const diff = Array(600).fill("+line;").join("\n");
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(diff));
    assert.equal(result.success, false);
    assert.equal(result.status, "fail");
    assert.ok(result.message.includes("600"));
    assert.ok(result.message.includes("500"));
    assert.ok(result.message.includes("100"));
    assert.ok(Array.isArray(result.penalties));
});

test("CommitSizeChecker uses custom threshold from config", async () => {
    const diff = Array(300).fill("+line;").join("\n");
    const config = {
        thresholds: { max_commit_lines: 200 },
    };
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(diff, config));
    assert.equal(result.success, false);
    assert.equal(result.status, "fail");
    assert.ok(result.message.includes("200"));
});

test("CommitSizeChecker uses camelCase threshold from config", async () => {
    const diff = Array(300).fill("+line;").join("\n");
    const config = {
        thresholds: { maxCommitLines: 200 },
    };
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(diff, config));
    assert.equal(result.success, false);
    assert.equal(result.status, "fail");
});

test("CommitSizeChecker passes with empty diff", async () => {
    const checker = new CommitSizeChecker();
    const result = await checker.run(createMockContext(""));
    assert.equal(result.success, true);
    assert.equal(result.status, "pass");
});

test("CommitSizeChecker has correct metadata", () => {
    const checker = new CommitSizeChecker();
    assert.equal(checker.id, "commit-size");
    assert.equal(checker.category, "history");
    assert.equal(checker.severity, "warning");
});
