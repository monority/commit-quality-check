import type { DiffAnalysis, ScoreSummary, TransparentScore, CheckResult, Penalty, CategoryScore } from '../types.js';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
    return Math.round(value);
}

function inferProbableType(analysis: DiffAnalysis): string {
    const {
        signals,
        sourceFiles,
        documentationFiles,
        testFiles,
        deletedTestFiles = [],
        ciFiles,
        dependencyFiles,
    } = analysis;

    if (documentationFiles.length > 0 && sourceFiles.length === 0 && testFiles.length === 0) {
        return "docs";
    }

    if (ciFiles.length > 0 && sourceFiles.length === 0) {
        return "ci";
    }

    if (dependencyFiles.length > 0 && sourceFiles.length === 0) {
        return "chore";
    }

    if ((testFiles.length > 0 || deletedTestFiles.length > 0) && sourceFiles.every((file) => analysis.testFiles.includes(file))) {
        return "test";
    }

    if (signals.hasSourceChanges) {
        return "feat";
    }

    return "chore";
}

function inferProbableScope(analysis: DiffAnalysis): string {
    if (analysis.workspaceScopes.length === 1) {
        return analysis.workspaceScopes[0]!;
    }

    const sourceFile = analysis.sourceFiles.find((file) => file.startsWith("src/"));
    if (sourceFile) {
        const segments = sourceFile.split("/");
        if (segments.length > 2) {
            return segments[1]!;
        }
    }

    const topLevel = analysis.topLevelAreas.find((area) => area && !area.startsWith("."));
    return topLevel || "repo";
}

export class ScoringEngine {
    score(analysis: DiffAnalysis, config?: Record<string, unknown>, checkerResults: CheckResult[] = []): ScoreSummary & TransparentScore {
        const weights = config?.weights as { message_quality: number; history_quality: number; workflow_quality: number } | undefined || { message_quality: 40, history_quality: 40, workflow_quality: 20 };

        const categoryPenalties = this._collectCategoryPenalties(checkerResults);

        const categories: CategoryScore[] = [
            this._scoreMessageQuality(analysis, categoryPenalties.message_quality || [], config),
            this._scoreHistoryQuality(analysis, categoryPenalties.history_quality || [], config),
            this._scoreWorkflowQuality(analysis, categoryPenalties.workflow_quality || [], config),
        ];

        const globalScore = Math.round(
            categories.reduce((sum, cat) => sum + cat.weightedScore, 0)
        );

        const recommendations = this._generateRecommendations(categories, analysis);

        const reasons: string[] = [];
        const scopeCount = Math.max(analysis.workspaceScopes.length, analysis.topLevelAreas.length);

        let atomicity = 100 - Math.max(0, scopeCount - 1) * 12;
        if (analysis.signals.touchesCI && analysis.signals.hasSourceChanges) {
            atomicity -= 15;
            reasons.push("CI and source changes mixed in one commit");
        }
        if (analysis.signals.touchesDependencies && analysis.signals.hasSourceChanges) {
            atomicity -= 10;
            reasons.push("Dependency updates mixed with source changes");
        }
        if (analysis.signals.touchesMigrations && analysis.signals.hasSourceChanges) {
            atomicity -= 10;
            reasons.push("Migration changes mixed with source changes");
        }
        if (analysis.signals.removesTests && analysis.signals.hasSourceChanges) {
            atomicity -= 10;
            reasons.push("Test removals mixed with source changes");
        }
        atomicity = clamp(round(atomicity), 25, 100);

        let scopePrecision = analysis.workspaceScopes.length === 1
            ? 95
            : 90 - Math.max(0, analysis.topLevelAreas.length - 1) * 10;
        scopePrecision = clamp(round(scopePrecision), 30, 95);

        let testCoverage = 100;
        let testsStatus: ScoreSummary['testsStatus'] = "NOT_NEEDED";
        if (analysis.signals.hasSourceChanges) {
            if (analysis.signals.hasTests) {
                testCoverage = 95;
                testsStatus = "PRESENT";
            } else {
                testCoverage = 35;
                testsStatus = "MISSING";
                reasons.push("Source changes detected without staged tests");
            }
        }
        if (analysis.signals.removesTests) {
            testCoverage = Math.min(testCoverage, analysis.signals.hasSourceChanges ? 40 : 60);
            testsStatus = "REDUCED";
            reasons.push("Removed tests detected in staged diff");
        }

        let riskScore = 0;
        if (analysis.signals.touchesEnv) {
            riskScore += 40;
            reasons.push("Environment file changes detected");
        }
        if (analysis.signals.touchesCI) {
            riskScore += 25;
            reasons.push("CI configuration changes detected");
        }
        if (analysis.signals.touchesAuth) {
            riskScore += 25;
            reasons.push("Auth-sensitive changes detected");
        }
        if (analysis.signals.touchesMigrations) {
            riskScore += 25;
            reasons.push("Migration changes detected");
        }
        if (analysis.signals.touchesDependencies) {
            riskScore += 20;
        }
        if (analysis.signals.touchesLockfiles) {
            riskScore += 10;
            reasons.push("Lockfile changes detected");
        }
        if (analysis.signals.touchesConfig) {
            riskScore += 15;
        }
        if (analysis.signals.removesTests) {
            riskScore += 30;
        }
        if (analysis.signals.hasSourceChanges && !analysis.signals.hasTests) {
            riskScore += 20;
        }
        riskScore = clamp(round(riskScore), 0, 100);

        const riskLevel: ScoreSummary['riskLevel'] = riskScore >= 75 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";

        return {
            globalScore,
            categories,
            recommendations,
            weights,
            probableType: inferProbableType(analysis),
            probableScope: inferProbableScope(analysis),
            atomicity,
            scopePrecision,
            testCoverage,
            testsStatus,
            riskScore,
            riskLevel,
            reasons: [...new Set(reasons)],
        };
    }

    _collectCategoryPenalties(checkerResults: CheckResult[]): { message_quality: Penalty[]; history_quality: Penalty[]; workflow_quality: Penalty[] } {
        const categoryMap: Record<string, string> = {
            message: 'message_quality',
            history: 'history_quality',
            workflow: 'workflow_quality',
            security: 'message_quality',
            quality: 'history_quality',
        };

        const penalties = { message_quality: [] as Penalty[], history_quality: [] as Penalty[], workflow_quality: [] as Penalty[] };

        for (const result of checkerResults) {
            if (result.penalties && Array.isArray(result.penalties)) {
                const catKey = categoryMap[result.category as string] || 'history_quality';
                if (penalties[catKey as keyof typeof penalties]) {
                    for (const p of result.penalties) {
                        penalties[catKey as keyof typeof penalties].push(p);
                    }
                }
            }
        }

        return penalties;
    }

    _scoreMessageQuality(analysis: DiffAnalysis, penalties: Penalty[], config?: Record<string, unknown>): CategoryScore {
        let score = 100;
        const applied: Penalty[] = [];

        for (const p of penalties) {
            score += p.impact;
            applied.push(p);
        }

        if (analysis.signals?.touchesAuth) {
            applied.push({ reason: 'Auth-sensitive changes detected', impact: -10 });
            score -= 10;
        }
        if (analysis.signals?.touchesMigrations) {
            applied.push({ reason: 'Migration changes detected', impact: -10 });
            score -= 10;
        }
        if (analysis.signals?.touchesEnv) {
            applied.push({ reason: 'Environment file changes detected', impact: -15 });
            score -= 15;
        }

        score = clamp(round(score), 0, 100);

        return {
            category: 'message_quality',
            label: 'Message Quality',
            score,
            weight: (config?.weights as Record<string, number> | undefined)?.message_quality ?? 40,
            weightedScore: round(score * ((config?.weights as Record<string, number> | undefined)?.message_quality ?? 40) / 100),
            penalties: applied,
            breakdown: [
                { label: 'Conventional format', value: score },
            ],
        };
    }

    _scoreHistoryQuality(analysis: DiffAnalysis, penalties: Penalty[], config?: Record<string, unknown>): CategoryScore {
        let score = 100;
        const applied: Penalty[] = [...penalties];

        const maxLines = (config?.thresholds as Record<string, number> | undefined)?.max_commit_lines ?? 500;
        const totalLines = (analysis.lineStats?.added ?? 0) + (analysis.lineStats?.removed ?? 0);
        if (totalLines > maxLines) {
            const impact = -Math.min(30, round((totalLines - maxLines) / maxLines * 20));
            applied.push({
                reason: `Commit too large (${totalLines} lines, max ${maxLines})`,
                impact,
                recommendation: 'Split into smaller atomic commits',
            });
            score += impact;
        }

        if (analysis.signals?.removesTests) {
            applied.push({
                reason: 'Tests removed in this diff',
                impact: -15,
                recommendation: 'Ensure tests are not removed without replacement',
            });
            score -= 15;
        }

        if (analysis.signals?.hasTests) {
            applied.push({
                reason: 'Tests included in commit',
                impact: 5,
            });
            score += 5;
        }

        if (analysis.signals?.touchesEnv) {
            applied.push({ reason: 'Environment file changes detected', impact: -20 });
            score -= 20;
        }
        if (analysis.signals?.touchesCI) {
            applied.push({ reason: 'CI configuration changes detected', impact: -15 });
            score -= 15;
        }
        if (analysis.signals?.touchesAuth) {
            applied.push({ reason: 'Auth-sensitive changes detected', impact: -15 });
            score -= 15;
        }
        if (analysis.signals?.touchesMigrations) {
            applied.push({ reason: 'Migration changes detected', impact: -15 });
            score -= 15;
        }
        if (analysis.signals?.touchesDependencies) {
            applied.push({ reason: 'Dependency changes detected', impact: -10 });
            score -= 10;
        }
        if (analysis.signals?.touchesLockfiles) {
            applied.push({ reason: 'Lockfile changes detected', impact: -8 });
            score -= 8;
        }
        if (analysis.signals?.touchesConfig) {
            applied.push({ reason: 'Configuration changes detected', impact: -8 });
            score -= 8;
        }
        if (analysis.signals?.hasSourceChanges && !analysis.signals?.hasTests) {
            applied.push({ reason: 'Source changes without tests', impact: -15 });
            score -= 15;
        }

        score = clamp(round(score), 0, 100);

        const sizeValue = totalLines > maxLines
            ? Math.max(0, 100 - round((totalLines - maxLines) / maxLines * 100))
            : 100;
        const testValue = analysis.signals?.hasTests
            ? 100
            : (analysis.signals?.removesTests ? 0 : 50);

        return {
            category: 'history_quality',
            label: 'History Quality',
            score,
            weight: (config?.weights as Record<string, number> | undefined)?.history_quality ?? 40,
            weightedScore: round(score * ((config?.weights as Record<string, number> | undefined)?.history_quality ?? 40) / 100),
            penalties: applied,
            breakdown: [
                { label: 'Commit size', value: sizeValue },
                { label: 'Test coverage', value: testValue },
            ],
        };
    }

    _scoreWorkflowQuality(analysis: DiffAnalysis, penalties: Penalty[], config?: Record<string, unknown>): CategoryScore {
        let score = 100;
        const applied: Penalty[] = [...penalties];

        for (const p of penalties) {
            score += p.impact;
        }

        score = clamp(round(score), 0, 100);

        const breakdown: Array<{ label: string; value: number }> = [];
        if (!applied.length) {
            breakdown.push({ label: 'Workflow compliance', value: score });
        } else {
            for (const p of applied) {
                breakdown.push({ label: p.reason, value: Math.max(0, score) });
            }
        }

        return {
            category: 'workflow_quality',
            label: 'Workflow Quality',
            score,
            weight: (config?.weights as Record<string, number> | undefined)?.workflow_quality ?? 20,
            weightedScore: round(score * ((config?.weights as Record<string, number> | undefined)?.workflow_quality ?? 20) / 100),
            penalties: applied,
            breakdown,
        };
    }

    _generateRecommendations(categories: CategoryScore[], analysis: DiffAnalysis): string[] {
        const recs: string[] = [];
        for (const cat of categories) {
            for (const p of cat.penalties) {
                if (p.recommendation && !recs.includes(p.recommendation)) {
                    recs.push(p.recommendation);
                }
            }
        }
        const msgCat = categories.find(c => c.category === 'message_quality');
        if (msgCat && msgCat.score < 80) {
            const rec = 'Adopt Conventional Commits for consistent messages';
            if (!recs.includes(rec)) recs.push(rec);
        }
        if (analysis.signals?.removesTests) {
            const rec = 'Add tests for new functionality';
            if (!recs.includes(rec)) recs.push(rec);
        }
        return recs;
    }
}
