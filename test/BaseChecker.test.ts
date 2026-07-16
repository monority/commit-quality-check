import test from "node:test";
import assert from "node:assert/strict";
import { BaseChecker, ProjectContext } from "../src/core/BaseChecker.js";
import type { CheckResult } from "../src/types.js";

class TestChecker extends BaseChecker {
    constructor() {
        super("Test Checker");
    }

    async run(): Promise<CheckResult> {
        return { success: true, message: "ok" };
    }
}

test("getStagedFiles reuses injected staged files from context", async () => {
    const checker = new TestChecker();
    const files = await checker.getStagedFiles({
        root: process.cwd(),
        projectPackage: {},
        packageManager: "npm",
        stagedFiles: ["src/app.js", "generated/out.js"],
        config: {
            ignore: ["generated/"],
        },
    } as ProjectContext);

    assert.deepEqual(files, ["src/app.js"]);
});