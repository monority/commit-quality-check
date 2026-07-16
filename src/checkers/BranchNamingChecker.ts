import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

const DEFAULT_BRANCH_PATTERN = "^(feature|fix|hotfix|chore|docs|release)/[a-z0-9._-]+$";

export class BranchNamingChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("Branch Naming");
        this.profile = "fast";
        this.id = "branch-naming";
        this.category = "workflow";
        this.severity = "warning";
        this.description = "Validates branch naming conventions";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const config = context.config as Record<string, unknown> | undefined;
        const rules = config?.rules as Record<string, unknown> | undefined;
        const pattern = (rules?.branch_pattern as string)
            ?? (rules?.branchPattern as string)
            ?? DEFAULT_BRANCH_PATTERN;

        const branchName = await this._getCurrentBranch(context);

        if (!branchName) {
            return {
                success: true,
                message: "Unable to determine current branch (detached HEAD or no git repo)",
                status: "skip",
            };
        }

        // Graceful skip for default branches (main, master, develop, dev)
        const defaultBranches = ["main", "master", "develop", "dev"];
        if (defaultBranches.includes(branchName.toLowerCase())) {
            return {
                success: true,
                message: `Branch "${branchName}" is a default branch (skipped)`,
                status: "skip",
            };
        }

        const regex = new RegExp(pattern);

        if (regex.test(branchName)) {
            return {
                success: true,
                message: `Branch name "${branchName}" follows naming convention`,
                status: "pass",
            };
        }

        return {
            success: false,
            message: `Branch name "${branchName}" does not match pattern: ${pattern}`,
            status: "fail",
            suggestedFix: `Rename branch to match pattern: ${pattern}`,
            penalties: [
                {
                    reason: "Non-conventional branch name",
                    impact: 10,
                    recommendation: `Use format: ${pattern}`,
                },
            ],
        };
    }

    async _getCurrentBranch(context: ProjectContext): Promise<string | null> {
        try {
            const result = await this.exec(context, "git", ["branch", "--show-current"]);
            if (result.success && result.stdout.trim()) {
                return result.stdout.trim();
            }
        } catch {
            // Not in a git repo
        }
        return null;
    }
}
