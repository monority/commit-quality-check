import type { CheckResult, DiffAnalysis, ScoreSummary, TransparentScore, SuggestionSummary, CheckerPlugin } from '../types.js';
import type { BaseChecker } from './BaseChecker.js';
import { ProjectContext } from "./ProjectContext.js";
import { CheckRegistry } from "./CheckRegistry.js";
import { TaskRunner } from "./TaskRunner.js";
import { Reporter } from "./Reporter.js";
import { ScoringEngine } from "./ScoringEngine.js";

export class QualityEngine {
    options: Record<string, unknown>;
    registry: CheckRegistry;
    runner: TaskRunner;
    reporter: Reporter;

    constructor(options: Record<string, unknown> = {}) {
        this.options = options;
        this.registry = new CheckRegistry();
        this.runner = new TaskRunner();
        this.reporter = new Reporter();
    }

    log(message: string): void {
        if (!(this.options.quiet as boolean)) {
            console.log(message);
        }
    }

    error(message: string): void {
        if (!(this.options.quiet as boolean)) {
            console.error(message);
        }
    }

    registerChecker(checker: BaseChecker): this {
        this.registry.register(checker);
        return this;
    }

    use(plugin: CheckerPlugin): this {
        this.registry.registerPlugin(plugin);
        return this;
    }

    async loadCheckers(): Promise<this> {
        if (this.registry.allCheckers.length > 0) {
            return this;
        }

        console.warn('[cq] No checkers registered automatically. Call registerBuiltinCheckers(engine) or use createQualityEngine().');
        return this;
    }

    async run(profile: string = "fast"): Promise<{
        allSuccess: boolean;
        results: CheckResult[];
        analysis: DiffAnalysis | null;
        scoreSummary: (ScoreSummary & TransparentScore) | null;
        transparentScore: TransparentScore | null;
        suggestionSummary: SuggestionSummary | null;
        reportPath: string | null;
        penalties: Array<{ reason: string; impact: number; recommendation?: string }>;
    }> {
        this.log(`ðŸš€ Running Quality Check [Profile: ${profile}]`);

        try {
            let reportPath: string | null = null;
            const context = await ProjectContext.create(this.options);
            context.profile = profile;

            await this.loadCheckers();

            const onlyCheckNames = this.options.onlyCheckNames as string[] | undefined || [];
            const skipList = onlyCheckNames.length > 0 ? [] : (context.config.skip as string[] | undefined || []);
            let checkers = this.registry.getCheckersForProfile(profile, skipList, onlyCheckNames);

            // Apply rules config to enable/disable specific checkers
            checkers = this._applyRulesFilter(checkers, context.config);

            this.log(`ðŸ” Executing ${checkers.length} checks...`);
            const results = await this.runner.execute(checkers as Array<{ run: (...args: unknown[]) => Promise<unknown>; name: string }>, context);

            // Collect penalties from checkers for scoring
            const allPenalties: Array<{ reason: string; impact: number; recommendation?: string }> = [];
            results.forEach(r => {
                if (r.penalties && Array.isArray(r.penalties)) {
                    allPenalties.push(...r.penalties);
                }
                if (!r.success) {
                    this.error(`âŒ ${r.name} failed: ${r.message}`);
                    if (r.suggestedFix) {
                        this.error(`ðŸ’¡ Fix: ${r.suggestedFix}`);
                    }
                }
            });

            // Attach penalties to context for scoring
            context.penalties = allPenalties;

            // Re-score with checker results for transparent scoring
            const scoringEngine = new ScoringEngine();
            const transparentScore = context.analysis
                ? scoringEngine.score(context.analysis, context.config, results)
                : {
                    globalScore: 0,
                    categories: [],
                    recommendations: ['No diff analysis available'],
                    weights: { message_quality: 40, history_quality: 40, workflow_quality: 20 },
                    probableType: 'unknown',
                    probableScope: 'unknown',
                    atomicity: 0,
                    scopePrecision: 0,
                    testCoverage: 0,
                    testsStatus: 'NOT_NEEDED' as const,
                    riskScore: 0,
                    riskLevel: 'LOW' as const,
                    reasons: ['No analysis available'],
                } as TransparentScore & ScoreSummary;
            context.transparentScore = transparentScore;
            // Keep scoreSummary backward-compatible (merge old fields with new globalScore)
            context.scoreSummary = {
                ...context.scoreSummary,
                globalScore: transparentScore.globalScore,
                reasons: transparentScore.reasons,
            } as ScoreSummary & TransparentScore;

            const allSuccess = results.every((r) => r.success);
            if (allSuccess) {
                this.log("âœ… All checks passed!");
            } else {
                this.error("ðŸš¨ Some checks failed. Please fix the issues before committing.");
                if (this.options.generateReport as boolean) {
                    reportPath = await this.reporter.generateReport(results, {
                        ...(context.root ? { root: context.root } : {}),
                        ...(context.analysis ? { analysis: context.analysis } : {}),
                        ...(context.scoreSummary ? { scoreSummary: context.scoreSummary } : {}),
                        ...(context.suggestionSummary ? { suggestionSummary: context.suggestionSummary } : {}),
                    });
                    this.log(`ðŸ“„ Report generated: ${reportPath}`);
                }
            }

            return {
                allSuccess,
                results,
                analysis: context.analysis,
                scoreSummary: context.scoreSummary,
                transparentScore: context.transparentScore,
                suggestionSummary: context.suggestionSummary,
                reportPath,
                penalties: allPenalties,
            };
        } catch (error) {
            this.error(`âŒ Execution failed: ${(error as Error).message}`);
            return {
                allSuccess: false,
                results: [],
                analysis: null,
                scoreSummary: null,
                transparentScore: null,
                suggestionSummary: null,
                reportPath: null,
                penalties: [],
            };
        }
    }

    _applyRulesFilter(checkers: BaseChecker[], config: Record<string, unknown>): BaseChecker[] {
        if (!config || !(config as Record<string, unknown>).rules) return checkers;

        const rules = (config as Record<string, unknown>).rules as Record<string, unknown>;

        // Map rule names to checker IDs
        const ruleToCheckerId: Record<string, string> = {
            conventional_commits: "conventional-commit",
            wip_commits: "wip-commit",
            branch_naming: "branch-naming",
            signed_commits: "signed-commit",
        };

        return checkers.filter((checker) => {
            if (!checker.id) return true; // No ID = always include (legacy checker)

            // Find matching rule for this checker
            for (const [ruleKey, checkerId] of Object.entries(ruleToCheckerId)) {
                if (checker.id === checkerId && rules[ruleKey] === false) {
                    return false; // Rule explicitly disabled
                }
            }
            return true;
        });
    }
}
