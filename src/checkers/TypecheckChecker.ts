import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

export class TypecheckChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Type Check");
        this.profile = "fast";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const pkg = context.projectPackage as Record<string, unknown> | undefined;
        const scripts = (pkg?.scripts as Record<string, unknown> | undefined) ?? {};
        const scriptNames = ["typecheck", "check-types", "types"];

        let script: string | null = null;
        for (const candidate of scriptNames) {
            if (scripts[candidate]) {
                script = candidate;
                break;
            }
        }

        if (!script) {
            return { success: true, message: "No typecheck script found" };
        }

        const result = await this.runScript(context, script);

        if (!result.success) {
            const err = result.stderr || result.stdout || "";
            const lines = err.split("\n").filter(Boolean).slice(0, 10).join("\n");
            return {
                success: false,
                message: `${script} failed`,
                suggestedFix: `Run: npm run ${script}`,
                details: `\`${script}\` failed.\n\nOutput:\n${lines}`,
            };
        }

        return { success: true, message: "Typecheck passed" };
    }
}
