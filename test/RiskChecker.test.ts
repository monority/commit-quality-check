import test from "node:test";
import assert from "node:assert/strict";
import { RiskChecker } from "../src/checkers/RiskChecker.js";

import type { ProjectContext } from "../src/core/BaseChecker.js";
import type { ScoreSummary } from "../src/types.js";

interface RiskContext extends ProjectContext {
    config: { risk: { failOn: string | null } };
    scoreSummary: ScoreSummary;
}

function createContext(overrides: Partial<RiskContext> = {}): RiskContext {
    return {
        config: {
            risk: {
                failOn: null,
            },
        },
        scoreSummary: {
            riskLevel: "HIGH",
            riskScore: 85,
            reasons: ["Environment file changes detected"],
        } as ScoreSummary,
        ...overrides,
    } as RiskContext;
}

test("reports high risk as advisory by default", async () => {
    const checker = new RiskChecker();
    const result = await checker.run(createContext());

    assert.equal(result.success, true);
    assert.equal(result.message, "Risk HIGH (85/100)");
    assert.match(result.details, /Environment file changes detected/);
});

test("fails when configured threshold is reached", async () => {
    const checker = new RiskChecker();
    const result = await checker.run(createContext({
        config: {
            risk: {
                failOn: "HIGH",
            },
        },
    }));

    assert.equal(result.success, false);
    assert.match(result.message, /exceeds configured threshold HIGH/);
    assert.match(result.suggestedFix, /gitQuality\.risk\.failOn/);
});

test("passes when risk level stays below configured threshold", async () => {
    const checker = new RiskChecker();
    const result = await checker.run(createContext({
        config: {
            risk: {
                failOn: "HIGH",
            },
        },
        scoreSummary: {
            riskLevel: "MEDIUM",
            riskScore: 55,
            reasons: ["CI configuration changes detected"],
        },
    }));

    assert.equal(result.success, true);
    assert.equal(result.message, "Risk MEDIUM (55/100)");
});