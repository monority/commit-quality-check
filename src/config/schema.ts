export interface ConfigOptions {
  rules?: Record<string, boolean>;
  thresholds?: Record<string, number>;
  weights?: Record<string, number>;
  skip?: string[];
  [key: string]: unknown;
}

interface ConfigSchemaEntry {
  type: string;
  default: unknown;
  description: string;
  min?: number;
  max?: number;
}

export const CONFIG_DEFAULTS: ConfigOptions = {
  rules: {
    conventional_commits: true,
    wip_commits: true,
    branch_naming: true,
    signed_commits: false,
  },
  thresholds: {
    max_commit_lines: 500,
    max_subject_length: 72,
  },
  weights: {
    message_quality: 40,
    history_quality: 40,
    workflow_quality: 20,
  },
  ai: {
    provider: undefined,
    apiKey: undefined,
    baseUrl: undefined,
    model: undefined,
    timeoutMs: 10000,
    temperature: 0.3,
  },
};

export const configSchema: Record<string, Record<string, ConfigSchemaEntry>> = {
  rules: {
    conventional_commits: { type: 'boolean', default: true, description: 'Enforce Conventional Commits format' },
    wip_commits: { type: 'boolean', default: true, description: 'Block WIP commits' },
    branch_naming: { type: 'boolean', default: true, description: 'Enforce branch naming conventions' },
    signed_commits: { type: 'boolean', default: false, description: 'Require signed commits' },
  },
  thresholds: {
    max_commit_lines: { type: 'number', default: 500, min: 1, description: 'Maximum lines per commit' },
    max_subject_length: { type: 'number', default: 72, min: 1, description: 'Maximum subject line length' },
  },
  weights: {
    message_quality: { type: 'integer', default: 40, min: 0, max: 100, description: 'Weight for message quality' },
    history_quality: { type: 'integer', default: 40, min: 0, max: 100, description: 'Weight for history quality' },
    workflow_quality: { type: 'integer', default: 20, min: 0, max: 100, description: 'Weight for workflow quality' },
  },
  ai: {
    provider: { type: 'string', default: undefined, description: 'AI provider (openai, anthropic, ollama)' },
    apiKey: { type: 'string', default: undefined, description: 'API key (or CQ_AI_KEY env var)' },
    baseUrl: { type: 'string', default: undefined, description: 'Custom API base URL' },
    model: { type: 'string', default: undefined, description: 'Model name (default depends on provider)' },
    timeoutMs: { type: 'number', default: 10000, min: 1000, description: 'Request timeout in ms' },
    temperature: { type: 'number', default: 0.3, min: 0, max: 2, description: 'LLM temperature' },
  },
};

export function validateConfig(config: Partial<ConfigOptions> = {}): string[] {
  const errors: string[] = [];

  // VÃ©rifie rules
  if (config.rules) {
    for (const key of Object.keys(config.rules)) {
      if (!(key in CONFIG_DEFAULTS.rules!)) {
        errors.push(`Unknown rule '${key}'. Valid rules: ${Object.keys(CONFIG_DEFAULTS.rules!).join(', ')}`);
      } else if (typeof config.rules[key] !== 'boolean') {
        errors.push(`Rule '${key}' must be boolean, got ${typeof config.rules[key]}`);
      }
    }
  }

  // VÃ©rifie thresholds
  if (config.thresholds) {
    for (const key of Object.keys(config.thresholds)) {
      if (!(key in CONFIG_DEFAULTS.thresholds!)) {
        errors.push(`Unknown threshold '${key}'. Valid thresholds: ${Object.keys(CONFIG_DEFAULTS.thresholds!).join(', ')}`);
      } else if (typeof config.thresholds[key] !== 'number' || config.thresholds[key]! < 1) {
        errors.push(`Threshold '${key}' must be a positive number`);
      }
    }
  }

  // VÃ©rifie weights
  if (config.weights) {
    let hasUnknownWeight = false;
    let hasInvalidWeight = false;
    for (const key of Object.keys(config.weights)) {
      if (!(key in CONFIG_DEFAULTS.weights!)) {
        errors.push(`Unknown weight '${key}'. Valid weights: ${Object.keys(CONFIG_DEFAULTS.weights!).join(', ')}`);
        hasUnknownWeight = true;
      } else if (!Number.isInteger(config.weights[key]) || config.weights[key]! < 0 || config.weights[key]! > 100) {
        errors.push(`Weight '${key}' must be an integer between 0 and 100`);
        hasInvalidWeight = true;
      }
    }
    // VÃ©rifie que la somme des poids est bien 100 (seulement si toutes les clÃ©s sont valides)
    if (!hasUnknownWeight && !hasInvalidWeight) {
      const weights = { ...CONFIG_DEFAULTS.weights, ...config.weights };
      const sum = Object.values(weights).reduce((a, b) => a + (b as number), 0);
      if (sum !== 100) {
        errors.push(`Weights must sum to 100, currently sum to ${sum}`);
      }
    }
  }

  // Accepte aussi les clÃ©s legacy (skip, ignore, autoPush, risk)
  return errors;
}
