import type { AiConfig } from '../types.js';
import { AiError } from '../types.js';

export async function generate(prompt: string, config: AiConfig): Promise<string> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: config.temperature ?? 0.3 },
    }),
  });

  if (response.status === 404) throw new AiError(`Model '${model}' not found in Ollama. Pull it first: ollama pull ${model}`, 'PROVIDER_DOWN', 'ollama');
  if (!response.ok) throw new AiError(`Ollama error: ${response.status} ${response.statusText}`, 'PROVIDER_DOWN', 'ollama');

  const data = await response.json() as { response?: string };
  return data.response ?? '';
}
