import type { CheckerPlugin, CheckResult, DiffAnalysis, ScoreSummary, TransparentScore, SuggestionSummary } from './types.js';
import type { BaseChecker } from './core/BaseChecker.js';
import { QualityEngine } from "./core/Engine.js";
import { registerBuiltinCheckers } from "./checkers/builtins.js";

export function createQualityEngine(options: Record<string, unknown> = {}): QualityEngine {
    const engine = new QualityEngine(options);

    return registerBuiltinCheckers(engine);
}

export { QualityEngine };
export type { QualityEngine as QualityEngineType };

// Re-export types for consumers
export type {
    CheckerPlugin,
    CheckResult,
    DiffAnalysis,
    ScoreSummary,
    TransparentScore,
    SuggestionSummary,
    BaseChecker,
};
