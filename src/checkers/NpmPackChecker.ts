import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

export class NpmPackChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("NPM Pack");
        this.profile = "full";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const result = await this.exec(context, "npm", ["pack", "--dry-run"]);

        if (!result.success) {
            const err = result.stderr || result.stdout || "";
            const lines = err.split("\n").filter(Boolean).slice(0, 12).join("\n");
            return {
                success: false,
                message: "npm pack dry-run failed",
                suggestedFix: "Run: npm pack --dry-run",
                details: lines,
            };
        }

        return { success: true, message: "npm pack dry-run passed" };
    }
}
