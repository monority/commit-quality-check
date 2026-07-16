import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult, ScoreSummary } from "../types.js";

const RISK_LEVEL_ORDER: Record<string, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
};

export class RiskChecker extends BaseChecker {
    declare profile: string;

    constructor() {
        super("Risk Analysis");
        this.profile = "fast";
    }

    async run(context: ProjectContext): Promise<CheckResult> {
        const ctx = context as ProjectContext & { scoreSummary?: ScoreSummary };
        const summary = ctx.scoreSummary;
        if (!summary) {
            return { success: true, message: "Risk summary unavailable" };
        }

        const config = context.config as Record<string, unknown> | undefined;
        const riskConfig = config?.risk as Record<string, unknown> | undefined;
        const failOn = normalizeFailOn(riskConfig?.failOn as string | undefined);
        const message = `Risk ${summary.riskLevel} (${summary.riskScore}/100)`;

        if (!failOn || !shouldFail(summary.riskLevel, failOn)) {
            return {
                success: true,
                message,
                details: buildDetails(summary),
            };
        }

        return {
            success: false,
            message: `${message} exceeds configured threshold ${failOn}`,
            suggestedFix: "Split risky changes, add tests, or relax gitQuality.risk.failOn",
            details: buildDetails(summary),
        };
    }
}

function normalizeFailOn(value: string | undefined): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toUpperCase();
    return RISK_LEVEL_ORDER[normalized] ? normalized : null;
}

function shouldFail(actualLevel: string, threshold: string): boolean {
    return (RISK_LEVEL_ORDER[actualLevel] ?? 0) >= (RISK_LEVEL_ORDER[threshold] ?? 0);
}

function buildDetails(summary: ScoreSummary): string {
    if (!summary.reasons?.length) {
        return "No additional risk reasons.";
    }

    return summary.reasons.map((reason) => `- ${reason}`).join("\n");
}
