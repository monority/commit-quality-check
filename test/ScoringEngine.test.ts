import test from "node:test";
import assert from "node:assert/strict";
import { ScoringEngine } from "../src/core/ScoringEngine.js";
import type { DiffAnalysis, DiffSignals, CheckResult, ConfigOptions } from "../src/types.js";

test("scores risky source change without tests", () => {
    const scoringEngine = new ScoringEngine();
    const summary = scoringEngine.score({
        sourceFiles: ["src/auth/login.ts"],
        testFiles: [],
        documentationFiles: [],
        ciFiles: [".github/workflows/ci.yml"],
        dependencyFiles: ["package.json"],
        lockfileFiles: ["pnpm-lock.yaml"],
        envFiles: [],
        authFiles: ["src/auth/login.ts"],
        migrationFiles: ["database/migrations/001_add_users.sql"],
        workspaceScopes: ["auth"],
        topLevelAreas: ["src", ".github", "package.json"],
        signals: {
            hasSourceChanges: true,
            hasTests: false,
            hasDocumentation: false,
            touchesConfig: true,
            touchesCI: true,
            touchesDependencies: true,
            touchesLockfiles: true,
            touchesEnv: false,
            touchesAuth: true,
            touchesMigrations: true,
        },
    });

    assert.equal(summary.probableType, "feat");
    assert.equal(summary.probableScope, "auth");
    assert.equal(summary.testsStatus, "MISSING");
    assert.equal(summary.riskLevel, "HIGH");
    assert.ok(summary.globalScore < 70);
    assert.ok(summary.reasons.includes("Source changes detected without staged tests"));
    assert.ok(summary.reasons.includes("CI and source changes mixed in one commit"));
    assert.ok(summary.reasons.includes("Auth-sensitive changes detected"));
    assert.ok(summary.reasons.includes("Migration changes detected"));
    assert.ok(summary.reasons.includes("Lockfile changes detected"));
});

test("scores docs-only change as low risk", () => {
    const scoringEngine = new ScoringEngine();
    const summary = scoringEngine.score({
        sourceFiles: [],
        testFiles: [],
        documentationFiles: ["README.md"],
        ciFiles: [],
        dependencyFiles: [],
        lockfileFiles: [],
        envFiles: [],
        authFiles: [],
        migrationFiles: [],
        workspaceScopes: [],
        topLevelAreas: ["README.md"],
        signals: {
            hasSourceChanges: false,
            hasTests: false,
            hasDocumentation: true,
            touchesConfig: false,
            touchesCI: false,
            touchesDependencies: false,
            touchesLockfiles: false,
            touchesEnv: false,
            touchesAuth: false,
            touchesMigrations: false,
        },
    });

    assert.equal(summary.probableType, "docs");
    assert.equal(summary.riskLevel, "LOW");
    assert.equal(summary.testsStatus, "NOT_NEEDED");
    assert.ok(summary.globalScore >= 85);
});

test("scores removed tests as elevated risk", () => {
    const scoringEngine = new ScoringEngine();
    const summary = scoringEngine.score({
        sourceFiles: ["src/auth/login.ts"],
        testFiles: [],
        deletedTestFiles: ["tests/auth/login.spec.ts"],
        documentationFiles: [],
        ciFiles: [],
        dependencyFiles: [],
        lockfileFiles: [],
        envFiles: [],
        authFiles: ["src/auth/login.ts"],
        migrationFiles: [],
        workspaceScopes: [],
        topLevelAreas: ["src", "tests"],
        signals: {
            hasSourceChanges: true,
            hasTests: false,
            hasDocumentation: false,
            touchesConfig: false,
            touchesCI: false,
            touchesDependencies: false,
            touchesLockfiles: false,
            touchesEnv: false,
            touchesAuth: true,
            touchesMigrations: false,
            removesTests: true,
        },
    });

    assert.equal(summary.probableType, "feat");
    assert.equal(summary.testsStatus, "REDUCED");
    assert.equal(summary.riskLevel, "HIGH");
    assert.ok(summary.reasons.includes("Removed tests detected in staged diff"));
    assert.ok(summary.reasons.includes("Test removals mixed with source changes"));
});

// --- Transparent Scoring Tests (Phase 3) ---

const cleanAnalysis: DiffAnalysis = {
    sourceFiles: [],
    testFiles: [],
    documentationFiles: [],
    ciFiles: [],
    dependencyFiles: [],
    lockfileFiles: [],
    envFiles: [],
    authFiles: [],
    migrationFiles: [],
    workspaceScopes: [],
    topLevelAreas: [],
    lineStats: { added: 10, removed: 5 },
    signals: {
        hasSourceChanges: false,
        hasTests: false,
        hasDocumentation: false,
        touchesConfig: false,
        touchesCI: false,
        touchesDependencies: false,
        touchesLockfiles: false,
        touchesEnv: false,
        touchesAuth: false,
        touchesMigrations: false,
        removesTests: false,
    },
};

test("transparent: perfect score returns 100/100/100 categories and global 100", () => {
    const engine = new ScoringEngine();
    const result = engine.score(cleanAnalysis);

    assert.equal(result.globalScore, 100);
    assert.equal(result.categories.length, 3);

    const msgCat = result.categories.find(c => c.category === "message_quality");
    const histCat = result.categories.find(c => c.category === "history_quality");
    const wfCat = result.categories.find(c => c.category === "workflow_quality");

    assert.equal(msgCat.score, 100);
    assert.equal(msgCat.weightedScore, 40);
    assert.equal(histCat.score, 100);
    assert.equal(histCat.weightedScore, 40);
    assert.equal(wfCat.score, 100);
    assert.equal(wfCat.weightedScore, 20);

    assert.deepEqual(result.weights, { message_quality: 40, history_quality: 40, workflow_quality: 20 });
    assert.ok(Array.isArray(result.recommendations));
    assert.equal(result.recommendations.length, 0);
});

test("transparent: checker penalties are collected and applied", () => {
    const engine = new ScoringEngine();
    const checkerResults = [
        {
            name: "WIP Commit",
            checker: "wip-commit",
            category: "message",
            status: "fail",
            success: false,
            message: "WIP commit detected",
            penalties: [
                { reason: "4 WIP commits", impact: -10, recommendation: "Use descriptive commit messages" },
            ],
        },
        {
            name: "Short Message",
            checker: "commit-msg",
            category: "message",
            status: "fail",
            success: false,
            message: "Message too short",
            penalties: [
                { reason: "2 short messages", impact: -8, recommendation: "Write longer commit messages" },
            ],
        },
    ];

    const result = engine.score(cleanAnalysis, {}, checkerResults);

    const msgCat = result.categories.find(c => c.category === "message_quality");
    assert.equal(msgCat.score, 82); // 100 - 10 - 8
    assert.equal(msgCat.penalties.length, 2);
    assert.equal(msgCat.penalties[0].reason, "4 WIP commits");
    assert.equal(msgCat.penalties[0].impact, -10);
    assert.equal(msgCat.penalties[1].reason, "2 short messages");
    assert.equal(msgCat.penalties[1].impact, -8);
});

test("transparent: custom weights from config are used", () => {
    const engine = new ScoringEngine();
    const config = {
        weights: { message_quality: 50, history_quality: 30, workflow_quality: 20 },
    };

    const result = engine.score(cleanAnalysis, config);

    assert.deepEqual(result.weights, { message_quality: 50, history_quality: 30, workflow_quality: 20 });

    const msgCat = result.categories.find(c => c.category === "message_quality");
    const histCat = result.categories.find(c => c.category === "history_quality");
    const wfCat = result.categories.find(c => c.category === "workflow_quality");

    assert.equal(msgCat.weight, 50);
    assert.equal(msgCat.weightedScore, 50);
    assert.equal(histCat.weight, 30);
    assert.equal(histCat.weightedScore, 30);
    assert.equal(wfCat.weight, 20);
    assert.equal(wfCat.weightedScore, 20);
    assert.equal(result.globalScore, 100);
});

test("transparent: breakdown per category is present", () => {
    const engine = new ScoringEngine();
    const result = engine.score(cleanAnalysis);

    for (const cat of result.categories) {
        assert.ok(Array.isArray(cat.breakdown), `${cat.category} has breakdown`);
        assert.ok(cat.breakdown.length > 0, `${cat.category} breakdown is non-empty`);
        for (const item of cat.breakdown) {
            assert.ok(typeof item.label === "string");
            assert.ok(typeof item.value === "number");
        }
    }
});

test("transparent: recommendations are generated from penalties", () => {
    const engine = new ScoringEngine();
    const checkerResults = [
        {
            name: "WIP Commit",
            checker: "wip-commit",
            category: "message",
            status: "fail",
            success: false,
            message: "WIP commit detected",
            penalties: [
                { reason: "WIP detected", impact: -30, recommendation: "Use descriptive commit messages" },
            ],
        },
    ];

    const result = engine.score(cleanAnalysis, {}, checkerResults);

    assert.ok(result.recommendations.includes("Use descriptive commit messages"));
    assert.ok(result.recommendations.includes("Adopt Conventional Commits for consistent messages"));
});

test("transparent: category mapping from checker categories", () => {
    const engine = new ScoringEngine();
    const checkerResults = [
        { name: "Secret", category: "security", status: "fail", success: false, message: "x", penalties: [{ reason: "secret", impact: -5 }] },
        { name: "Test", category: "quality", status: "fail", success: false, message: "x", penalties: [{ reason: "no test", impact: -5 }] },
        { name: "Branch", category: "workflow", status: "fail", success: false, message: "x", penalties: [{ reason: "bad branch", impact: -5 }] },
        { name: "History", category: "history", status: "fail", success: false, message: "x", penalties: [{ reason: "bad history", impact: -5 }] },
    ];

    const result = engine.score(cleanAnalysis, {}, checkerResults);

    const msgCat = result.categories.find(c => c.category === "message_quality");
    const histCat = result.categories.find(c => c.category === "history_quality");
    const wfCat = result.categories.find(c => c.category === "workflow_quality");

    // security → message_quality
    assert.ok(msgCat.penalties.some(p => p.reason === "secret"));
    // quality → history_quality
    assert.ok(histCat.penalties.some(p => p.reason === "no test"));
    // workflow → workflow_quality
    assert.ok(wfCat.penalties.some(p => p.reason === "bad branch"));
    // history → history_quality
    assert.ok(histCat.penalties.some(p => p.reason === "bad history"));
});

test("transparent: score clamped to 0 minimum", () => {
    const engine = new ScoringEngine();
    const checkerResults = [
        {
            name: "Many penalties",
            category: "message",
            status: "fail",
            success: false,
            message: "x",
            penalties: [
                { reason: "p1", impact: -50 },
                { reason: "p2", impact: -60 },
            ],
        },
    ];

    const result = engine.score(cleanAnalysis, {}, checkerResults);
    const msgCat = result.categories.find(c => c.category === "message_quality");

    assert.equal(msgCat.score, 0); // 100 - 50 - 60 = -10 → clamped to 0
    assert.ok(msgCat.weightedScore >= 0);
});

test("transparent: score clamped to 100 maximum", () => {
    const engine = new ScoringEngine();
    const analysisWithTests = {
        ...cleanAnalysis,
        signals: { ...cleanAnalysis.signals, hasTests: true },
    };

    const result = engine.score(analysisWithTests);
    const histCat = result.categories.find(c => c.category === "history_quality");

    // hasTests gives +5 bonus, but score should not exceed 100
    assert.ok(histCat.score <= 100);
});

test("transparent: history quality penalizes large commits", () => {
    const engine = new ScoringEngine();
    const config = { thresholds: { max_commit_lines: 100 } };
    const analysis = {
        ...cleanAnalysis,
        lineStats: { added: 500, removed: 200 },
    };

    const result = engine.score(analysis, config);
    const histCat = result.categories.find(c => c.category === "history_quality");

    assert.ok(histCat.score < 100);
    assert.ok(histCat.penalties.some(p => p.reason.includes("Commit too large")));
    assert.ok(histCat.penalties.some(p => p.recommendation === "Split into smaller atomic commits"));
});

test("transparent: history quality penalizes test removal", () => {
    const engine = new ScoringEngine();
    const analysis = {
        ...cleanAnalysis,
        signals: { ...cleanAnalysis.signals, removesTests: true },
    };

    const result = engine.score(analysis);
    const histCat = result.categories.find(c => c.category === "history_quality");

    assert.ok(histCat.penalties.some(p => p.reason === "Tests removed in this diff"));
    assert.ok(result.recommendations.includes("Add tests for new functionality"));
});

test("transparent: backward compat fields are present", () => {
    const engine = new ScoringEngine();
    const result = engine.score(cleanAnalysis);

    // Old ScoreSummary fields
    assert.ok(typeof result.probableType === "string");
    assert.ok(typeof result.probableScope === "string");
    assert.ok(typeof result.atomicity === "number");
    assert.ok(typeof result.scopePrecision === "number");
    assert.ok(typeof result.testCoverage === "number");
    assert.ok(["PRESENT", "MISSING", "REDUCED", "NOT_NEEDED"].includes(result.testsStatus));
    assert.ok(typeof result.riskScore === "number");
    assert.ok(["LOW", "MEDIUM", "HIGH"].includes(result.riskLevel));
    assert.ok(typeof result.globalScore === "number");
    assert.ok(Array.isArray(result.reasons));

    // New TransparentScore fields
    assert.ok(Array.isArray(result.categories));
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(typeof result.weights === "object");
});