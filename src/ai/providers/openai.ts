import type { AiConfig } from '../types.js';
import { AiError } from '../types.js';

export async function generate(prompt: string, config: AiConfig): Promise<string> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.CQ_AI_KEY || process.env.CQC_AI_KEY;
  if (!apiKey) throw new AiError('OpenAI API key required. Set CQ_AI_KEY or OPENAI_API_KEY env var.', 'UNAUTHORIZED', 'openai');

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const model = config.model || 'gpt-4o-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.3,
      max_tokens: 200,
    }),
  });

  if (response.status === 429) throw new AiError('Rate limited by OpenAI', 'RATE_LIMITED', 'openai');
  if (response.status === 401) throw new AiError('Invalid OpenAI API key', 'UNAUTHORIZED', 'openai');
  if (!response.ok) throw new AiError(`OpenAI API error: ${response.status} ${response.statusText}`, 'PROVIDER_DOWN', 'openai');

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

