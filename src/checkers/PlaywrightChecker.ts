import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

export class PlaywrightChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Playwright Tests");
        this.profile = "full";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const pkg = context.projectPackage as Record<string, unknown> | undefined;
        const scripts = (pkg?.scripts as Record<string, unknown> | undefined) ?? {};
        const scriptNames = ["test:e2e", "playwright", "test:playwright", "e2e"];

        let script: string | null = null;
        for (const s of scriptNames) {
            if (scripts[s]) {
                script = s;
                break;
            }
        }

        const depsCheck = await this.checkDependencies(context, ["@playwright/test", "playwright"]);
        if (!depsCheck.installed) {
            return {
                success: false,
                message: "Playwright not installed",
                suggestedFix: "npm install --save-dev @playwright/test playwright",
                details: `Install Playwright:\n\`npm install --save-dev @playwright/test playwright\`\n\`npx playwright install\``,
            };
        }

        if (!script) {
            return { success: true, message: "No e2e script found" };
        }

        const result = await this.runScript(context, script);

        if (!result.success) {
            const err = result.stderr || result.stdout || "";
            const lines = err.split("\n").slice(0, 10).join("\n");
            return {
                success: false,
                message: `E2E tests failed`,
                suggestedFix: `npm run ${script}`,
                details: `Run \`npm run ${script}\` to see errors.\n\n${lines}`,
            };
        }

        return { success: true, message: "E2E tests passed" };
    }
}
