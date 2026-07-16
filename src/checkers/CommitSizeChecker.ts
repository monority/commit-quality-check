import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

export class CommitSizeChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("Commit Size");
        this.profile = "fast";
        this.id = "commit-size";
        this.category = "history";
        this.severity = "warning";
        this.description = "Warns when commit exceeds configured line threshold";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const ctx = context as ProjectContext & { stagedDiff?: string };
        const config = context.config as Record<string, unknown> | undefined;
        const thresholds = config?.thresholds as Record<string, unknown> | undefined;
        const maxLines = (thresholds?.max_commit_lines as number)
            ?? (thresholds?.maxCommitLines as number)
            ?? 500;

        const diff = ctx.stagedDiff || "";
        const lineCount = diff ? diff.split("\n").length : 0;

        if (lineCount <= maxLines) {
            return {
                success: true,
                message: `Commit size is ${lineCount} lines (threshold: ${maxLines})`,
                status: "pass",
            };
        }

        const delta = lineCount - maxLines;
        return {
            success: false,
            message: `Commit size (${lineCount} lines) exceeds threshold (${maxLines}) by ${delta} lines`,
            status: "fail",
            suggestedFix: "Split this commit into smaller, focused changes",
            penalties: [
                {
                    reason: `Commit exceeds size threshold by ${delta} lines`,
                    impact: Math.min(20, Math.floor(delta / 50)),
                    recommendation: "Split into smaller commits",
                },
            ],
        };
    }
}
