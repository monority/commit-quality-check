import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

const VALID_TYPES = [
    "feat", "fix", "docs", "style", "refactor",
    "perf", "test", "build", "ci", "chore", "revert",
];

const CONVENTIONAL_REGEX = new RegExp(
    `^(${VALID_TYPES.join("|")})(\\([a-z0-9._-]+\\))?!?: .+$`
);

export class ConventionalCommitChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("Conventional Commit");
        this.profile = "fast";
        this.id = "conventional-commit";
        this.category = "message";
        this.severity = "error";
        this.description = "Enforces Conventional Commits format: type(scope)!: description";
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

        if (CONVENTIONAL_REGEX.test(message)) {
            return {
                success: true,
                message: `Commit message follows Conventional Commits: "${message}"`,
                status: "pass",
            };
        }

        const typeMatch = message.match(/^([a-z]+)/);
        const detectedType = typeMatch ? typeMatch[1] : null;
        const typeHint = detectedType && !VALID_TYPES.includes(detectedType)
            ? `\nDetected type "${detectedType}" is not valid. Valid types: ${VALID_TYPES.join(", ")}`
            : "";

        return {
            success: false,
            message: `Commit message does not follow Conventional Commits format.\nMessage: "${message}"${typeHint}\nExpected: type(scope)!: description`,
            status: "fail",
            penalties: [
                {
                    reason: "Non-conventional commit message",
                    impact: 30,
                    recommendation: "Use format: type(scope)!: description",
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
