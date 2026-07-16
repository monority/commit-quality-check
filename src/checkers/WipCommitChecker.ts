import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

const WIP_PATTERNS = [
    /\bwip\b/i,
    /\bwork\s*in\s*progress\b/i,
    /\btemp\b/i,
    /\btodo\b/i,
    /\bfixme\b/i,
];

export class WipCommitChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("WIP Commit");
        this.profile = "fast";
        this.id = "wip-commit";
        this.category = "message";
        this.severity = "error";
        this.description = "Detects and blocks WIP (work-in-progress) commit messages";
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

        const matchedPattern = WIP_PATTERNS.find((p) => p.test(message));

        if (!matchedPattern) {
            return {
                success: true,
                message: `Commit message is not a WIP: "${message}"`,
                status: "pass",
            };
        }

        return {
            success: false,
            message: `WIP commit detected: "${message}" matches pattern "${matchedPattern.source}"`,
            status: "fail",
            suggestedFix: "Complete your work before committing, or use a more descriptive message",
            penalties: [
                {
                    reason: "WIP commit message detected",
                    impact: 25,
                    recommendation: "Use a descriptive commit message instead of WIP/temp/TODO",
                },
            ],
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
