import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

export class MergeCommitChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("Merge Commit");
        this.profile = "fast";
        this.id = "merge-commit";
        this.category = "history";
        this.severity = "info";
        this.description = "Detects merge commits and encourages rebase workflow";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const message = this._extractCommitMessage(context);

        if (!message) {
            return {
                success: true,
                message: "No commit message to validate",
                status: "skip",
            };
        }

        if (message.startsWith("Merge")) {
            return {
                success: true,
                message: `Merge commit detected: "${message}". Consider using rebase instead of merge.`,
                status: "pass",
                details: "Info: Merge commits are allowed but rebasing keeps history cleaner.",
            };
        }

        return {
            success: true,
            message: `Not a merge commit: "${message}"`,
            status: "pass",
        };
    }

    _extractCommitMessage(context: ProjectContext): string | null {
        const ctx = context as ProjectContext & { commitMsgPath?: string };
        const { commitMsgPath, root } = ctx;

        if (commitMsgPath) {
            const resolvedPath = commitMsgPath.startsWith(".")
                ? resolve(root || process.cwd(), commitMsgPath)
                : commitMsgPath;
            if (existsSync(resolvedPath)) {
                const msg = readFileSync(resolvedPath, "utf8").trim();
                if (msg && !/^\d+(\.\d+)*$/.test(msg)) {
                    return msg;
                }
            }
        }

        return null;
    }
}
