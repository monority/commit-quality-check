import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

export class TestChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Test Suite");
        this.profile = "fast";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const pkg = context.projectPackage as Record<string, unknown> | undefined;
        const scripts = (pkg?.scripts as Record<string, unknown> | undefined) ?? {};
        const scriptNames = ["test", "test:unit", "test:ci", "vitest", "jest"];

        let script: string | null = null;
        for (const s of scriptNames) {
            if (scripts[s]) {
                script = s;
                break;
            }
        }

        if (!script) {
            return { success: true, message: "No test script found" };
        }

        const result = await this.runScript(context, script);

        if (!result.success) {
            const err = result.stderr || result.stdout || "";
            const lines = err.split("\n").filter((l) => l.trim()).slice(0, 10).join("\n");
            return {
                success: false,
                message: `${script} failed`,
                suggestedFix: `Run: npm test`,
                details: `\`${script}\` failed.\n\nOutput:\n${lines}`,
            };
        }

        return { success: true, message: `Tests passed` };
    }
}
