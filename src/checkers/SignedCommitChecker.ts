import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult, CheckerCategory, CheckerSeverity } from "../types.js";

export class SignedCommitChecker extends BaseChecker {
    declare profile: string;
    declare id: string;
    declare category: CheckerCategory;
    declare severity: CheckerSeverity;
    declare description: string;

    constructor() {
        super("Signed Commit");
        this.profile = "fast";
        this.id = "signed-commit";
        this.category = "workflow";
        this.severity = "warning";
        this.description = "Checks if commits are configured to be GPG signed";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const gpgSignConfig = await this._getGpgSignConfig(context);

        if (gpgSignConfig === null) {
            return {
                success: true,
                message: "GPG signing not configured (skipped)",
                status: "skip",
            };
        }

        if (gpgSignConfig === "true") {
            return {
                success: true,
                message: "Commits are configured to be GPG signed",
                status: "pass",
            };
        }

        return {
            success: false,
            message: "GPG signing is not enabled (commit.gpgsign is not true)",
            status: "fail",
            suggestedFix: "Run: git config --global commit.gpgsign true",
            penalties: [
                {
                    reason: "Unsigned commit configuration",
                    impact: 5,
                    recommendation: "Enable GPG signing with: git config commit.gpgsign true",
                },
            ],
        };
    }

    async _getGpgSignConfig(context: ProjectContext): Promise<string | null> {
        const { root } = context;
        try {
            const result = await this.exec(context, "git", ["config", "commit.gpgsign"], {
                cwd: root,
            });
            if (result.success) {
                return result.stdout.trim().toLowerCase();
            }
        } catch {
            // Git config not available
        }
        return null;
    }
}
