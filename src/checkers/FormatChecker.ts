import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import { extname } from "node:path";
import type { CheckResult } from "../types.js";

export class FormatChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Formatting (Prettier)");
        this.profile = "fast";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const config = context.config as Record<string, unknown> | undefined;
        const staged = config?.staged as Record<string, unknown> | undefined;
        if (!staged?.prettier) {
            return { success: true, message: "Skipped by config" };
        }

        const depCheck = await this.checkDependencies(context, ["prettier"]);
        if (!depCheck.installed) {
            return {
                success: true,
                message: "Skipped: Prettier not found",
                suggestedFix: "npm install --save-dev prettier",
            };
        }

        const files = await this.getStagedFiles(context);
        const formatFiles = files.filter((f) => this.isFormattable(f));

        if (formatFiles.length === 0) {
            return { success: true, message: "No formatable files staged" };
        }

        const result = await this.exec(context, "prettier", [
            "--write",
            ...formatFiles,
        ]);

        if (!result.success) {
            const err = result.stderr || result.stdout || "";
            return {
                success: false,
                message: "Formatting issues found",
                suggestedFix: "npm run format",
                details: `Run \`npm run format\` to format files.\n\n${err}`,
            };
        }

        return { success: true, message: "Formatting passed" };
    }

    isFormattable(file: string): boolean {
        const ext = extname(file);
        return [
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".json",
            ".md",
            ".yml",
            ".yaml",
            ".css",
            ".scss",
            ".html",
        ].includes(ext);
    }
}
