import type { AiConfig } from '../types.js';
import { AiError } from '../types.js';

export async function generate(prompt: string, config: AiConfig): Promise<string> {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CQ_AI_KEY || process.env.CQC_AI_KEY;
  if (!apiKey) throw new AiError('Anthropic API key required. Set CQ_AI_KEY or ANTHROPIC_API_KEY env var.', 'UNAUTHORIZED', 'anthropic');

  const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  const model = config.model || 'claude-sonnet-4-20250514';

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (response.status === 429) throw new AiError('Rate limited by Anthropic', 'RATE_LIMITED', 'anthropic');
  if (response.status === 401) throw new AiError('Invalid Anthropic API key', 'UNAUTHORIZED', 'anthropic');
  if (!response.ok) throw new AiError(`Anthropic API error: ${response.status} ${response.statusText}`, 'PROVIDER_DOWN', 'anthropic');

  const data = await response.json() as { content?: Array<{ text?: string }> };
  return data.content?.map(c => c.text ?? '').join('\n') ?? '';
}

