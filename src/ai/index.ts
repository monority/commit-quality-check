import type { AiConfig, AiSuggestion, AiSuggestionContext, AiModule, AiProviderName } from './types.js';
import { AiError } from './types.js';

export function createAiProvider(config?: AiConfig | null): AiModule | null {
  if (!config?.provider) return null;
  return { suggest: (ctx) => suggestWithProvider(ctx, config) };
}

async function suggestWithProvider(ctx: AiSuggestionContext, config: AiConfig): Promise<AiSuggestion | null> {
  const start = Date.now();
  try {
    const providerModule = await loadProviderModule(config.provider);
    const prompt = buildPrompt(ctx, config);
    const raw = await withTimeout(providerModule.generate(prompt, config), config.timeoutMs ?? 10_000);
    return parseAiResponse(raw, Date.now() - start);
  } catch (err) {
    if (err instanceof AiError) {
      console.warn(`[cq:ai] ${err.message} (${err.code}${err.provider ? ` @ ${err.provider}` : ''})`);
    } else {
      console.warn(`[cq:ai] ${(err as Error).message}`);
    }
    return null;
  }
}

async function loadProviderModule(provider: AiProviderName): Promise<{ generate(prompt: string, config: AiConfig): Promise<string> }> {
  switch (provider) {
    case 'openai':
      return import('./providers/openai.js');
    case 'anthropic':
      return import('./providers/anthropic.js');
    case 'ollama':
      return import('./providers/ollama.js');
    default:
      throw new AiError(`Unsupported AI provider: ${provider}`, 'NO_PROVIDER');
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError('AI provider timed out', 'TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function buildPrompt(ctx: AiSuggestionContext, _config: AiConfig): string {
  const signals = Object.entries(ctx.signals)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');
  return [
    'You are a git commit message assistant. Given the following staged changes:',
    `Files changed: ${ctx.stagedFiles.join(', ')}`,
    `Diff stats: +${ctx.diffStats.added} -${ctx.diffStats.removed} lines`,
    signals ? `Signals: ${signals}` : '',
    '',
    `Current deterministic suggestion: "${ctx.currentSuggestion.header}"`,
    `Rationale: ${ctx.rationale.join('; ')}`,
    '',
    'Suggest up to 3 improved Conventional Commits headers. Reply with ONLY a JSON array of strings.',
    'Example: ["feat(auth): add OAuth2 login flow", "fix(auth): resolve token refresh issue"]',
  ].filter(Boolean).join('\n');
}

function parseAiResponse(raw: string, latencyMs: number): AiSuggestion {
  const jsonMatch = raw.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) throw new AiError('No JSON array found in AI response', 'PARSE_ERROR');
  try {
    const alternatives: string[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(alternatives) || !alternatives.every(a => typeof a === 'string')) {
      throw new AiError('AI response is not an array of strings', 'PARSE_ERROR');
    }
    return {
      alternatives: alternatives.slice(0, 3),
      feedback: alternatives.length > 0 ? 'AI-enhanced alternatives available' : '',
      latencyMs,
    };
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(`Failed to parse AI response: ${(err as Error).message}`, 'PARSE_ERROR');
  }
}
