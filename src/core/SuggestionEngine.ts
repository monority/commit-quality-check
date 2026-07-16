import type { DiffAnalysis, ScoreSummary, SuggestionSummary } from '../types.js';
import type { AiModule, AiSuggestion } from '../ai/types.js';

function buildDescription(analysis: DiffAnalysis, scoreSummary: ScoreSummary, scope: string): string {
  if (analysis.signals.hasDocumentation && !analysis.signals.hasSourceChanges) {
    return "update documentation";
  }

  if (analysis.signals.touchesCI && !analysis.signals.hasSourceChanges) {
    return "update ci workflow";
  }

  if (analysis.signals.touchesMigrations) {
    return "add database migration";
  }

  if (analysis.signals.touchesAuth && analysis.signals.hasSourceChanges) {
    return "update auth flow";
  }

  if (analysis.signals.touchesEnv) {
    return "update environment configuration";
  }

  if (analysis.signals.touchesDependencies && !analysis.signals.hasSourceChanges) {
    return "update dependencies";
  }

  if (analysis.signals.removesTests && !analysis.signals.hasSourceChanges) {
    return "update test coverage";
  }

  if (analysis.testFiles.length > 0 && !analysis.signals.hasSourceChanges) {
    return "add test coverage";
  }

  if (scope && scope !== "repo") {
    return `update ${scope}`;
  }

  if (scoreSummary?.probableType === "docs") {
    return "update documentation";
  }

  if (!analysis || analysis.files.length === 0) {
    return "update project files";
  }

  return "update project files";
}

function buildRationale(analysis: DiffAnalysis, scoreSummary: ScoreSummary): string[] {
  if (scoreSummary?.reasons?.length) {
    return scoreSummary.reasons.slice(0, 3);
  }

  const reasons: string[] = [];
  if (analysis?.signals?.touchesAuth) reasons.push("Auth-sensitive changes detected");
  if (analysis?.signals?.touchesMigrations) reasons.push("Migration changes detected");
  if (analysis?.signals?.touchesCI) reasons.push("CI configuration changes detected");
  if (analysis?.signals?.touchesDependencies) reasons.push("Dependency changes detected");
  return reasons;
}

export class SuggestionEngine {
  private aiProvider: AiModule | null;

  constructor(aiProvider?: AiModule | null) {
    this.aiProvider = aiProvider ?? null;
  }

  async suggest(analysis: DiffAnalysis, scoreSummary: ScoreSummary): Promise<SuggestionSummary> {
    const type = scoreSummary?.probableType || "chore";
    const scope = scoreSummary?.probableScope || "repo";
    const description = buildDescription(analysis, scoreSummary, scope);
    const suggestedHeader = scope && scope !== "repo"
      ? `${type}(${scope}): ${description}`
      : `${type}: ${description}`;

    const rationale = buildRationale(analysis, scoreSummary);

    // AI enrichment (optional, never blocks main flow)
    let aiSuggestion: AiSuggestion | null = null;
    if (this.aiProvider) {
      try {
        aiSuggestion = await this.aiProvider.suggest({
          stagedFiles: analysis.files,
          diffStats: analysis.lineStats,
          signals: analysis.signals as unknown as Record<string, boolean>,
          currentSuggestion: { type, scope, description, header: suggestedHeader },
          rationale,
        });
      } catch {
        // Silently fail — AI is just a bonus
      }
    }

    // Enrich rationale with AI alternatives
    const enrichedRationale = aiSuggestion?.alternatives?.length
      ? [...rationale, ...aiSuggestion.alternatives.map(a => `✨ AI: ${a}`)]
      : rationale;

    return {
      type,
      scope,
      description,
      suggestedHeader,
      rationale: enrichedRationale,
    };
  }
}
