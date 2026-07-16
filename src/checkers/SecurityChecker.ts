import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

export class SecurityChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Dependencies Vulnerabilities");
        this.profile = "fast";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const { packageManager } = context;
        const pm = packageManager || "npm";

        try {
            const result = await this.exec(context, pm, ["audit"]);
            const output = result.stdout || result.stderr || "";
            const hasVulns = output.includes("vulnerabilities") && !output.includes("0 vulnerabilities");

            if (hasVulns) {
                const lines = output.split("\n").slice(0, 15).join("\n");
                return {
                    success: false,
                    message: "Vulnerabilities found",
                    suggestedFix: `${pm} audit fix`,
                    details: `Run \`${pm} audit fix\` to fix.\n\n${lines}`,
                };
            }

            return { success: true, message: "No vulnerabilities found" };
        } catch (error) {
            const err = error as { stderr?: string; message?: string };
            const errMsg = err.stderr || err.message || "";
            const lines = errMsg.split("\n").slice(0, 15).join("\n");
            if (lines.includes("vulnerabilities")) {
                return {
                    success: false,
                    message: "Vulnerabilities found",
                    suggestedFix: `${pm} audit fix`,
                    details: `Run \`${pm} audit fix\` to fix.\n\n${lines}`,
                };
            }
            return { success: true, message: "No vulnerabilities found" };
        }
    }
}
