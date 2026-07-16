/** Providers supportés */
export type AiProviderName = 'openai' | 'anthropic' | 'ollama';

/** Erreurs spécifiques AI */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: 'PROVIDER_DOWN' | 'RATE_LIMITED' | 'TIMEOUT' | 'UNAUTHORIZED' | 'NO_PROVIDER' | 'PARSE_ERROR',
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Suggestion enrichie par AI */
export interface AiSuggestion {
  alternatives: string[];
  feedback: string;
  latencyMs: number;
}

/** Configuration AI */
export interface AiConfig {
  provider: AiProviderName;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
}

/** Interface du module provider (chargé dynamiquement) */
export interface AiModule {
  suggest(context: AiSuggestionContext): Promise<AiSuggestion | null>;
}

/** Contexte passé au provider pour générer une suggestion */
export interface AiSuggestionContext {
  stagedFiles: string[];
  diffStats: { added: number; removed: number };
  signals: Record<string, boolean>;
  currentSuggestion: { type: string; scope: string; description: string; header: string };
  rationale: string[];
}
