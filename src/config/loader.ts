import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { ConfigOptions } from './schema.js';
import { CONFIG_DEFAULTS, validateConfig } from './schema.js';
import type { AiConfig } from '../ai/types.js';
import type { AiProviderName } from '../ai/types.js';

export const CONFIG_FILENAMES = ['commit-quality-check.yml', 'commit-quality-check.yaml'];

export function findConfigFile(root: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const path = join(root, name);
    if (existsSync(path)) return path;
  }
  return null;
}

export function loadYamlFile(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf8');
  return yaml.load(content) as Record<string, unknown>;
}

export function parseCliOverrides(argv: string[]): Record<string, unknown> {
  // Parse --key=value ou --key value
  // Supporte: --config path, --skip eslint,prettier, --thresholds.max-commit-lines=200
  const overrides: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg!.startsWith('--')) {
      const eqIdx = arg!.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg!.slice(2, eqIdx);
        const val = arg!.slice(eqIdx + 1);
        setNested(overrides, key, val);
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        const key = arg!.slice(2);
        setNested(overrides, key, argv[i + 1]);
        i++;
      } else {
        setNested(overrides, arg!.slice(2), true);
      }
    }
  }
  return overrides;
}

export function parseEnvOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  
  const cqConfig = process.env.CQ_CONFIG || process.env.CQC_CONFIG;
  if (cqConfig) overrides.config = cqConfig;
  
  const cqSkip = process.env.CQ_SKIP || process.env.CQC_SKIP;
  if (cqSkip) overrides.skip = cqSkip.split(',').map(s => s.trim());
  
  const cqThresholdLines = process.env.CQ_THRESHOLD_MAX_LINES || process.env.CQC_THRESHOLD_MAX_LINES;
  if (cqThresholdLines) {
    setNested(overrides, 'thresholds.max-commit-lines', parseInt(cqThresholdLines, 10));
  }
  
  const cqThresholdSubject = process.env.CQ_THRESHOLD_SUBJECT_LENGTH || process.env.CQC_THRESHOLD_SUBJECT_LENGTH;
  if (cqThresholdSubject) {
    setNested(overrides, 'thresholds.max-subject-length', parseInt(cqThresholdSubject, 10));
  }
  
  const cqConvCommits = process.env.CQ_RULES_CONVENTIONAL_COMMITS ?? process.env.CQC_RULES_CONVENTIONAL_COMMITS;
  if (cqConvCommits !== undefined) {
    setNested(overrides, 'rules.conventional-commits', cqConvCommits === 'true');
  }
  
  const cqAiProvider = process.env.CQ_AI_PROVIDER || process.env.CQC_AI_PROVIDER;
  if (cqAiProvider) {
    setNested(overrides, 'ai.provider', cqAiProvider);
  }
  
  const cqAiKey = process.env.CQ_AI_KEY || process.env.CQC_AI_KEY;
  if (cqAiKey) {
    setNested(overrides, 'ai.apiKey', cqAiKey);
  }
  
  return overrides;
}
function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!.replace(/-/g, '_');
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1]!.replace(/-/g, '_');
  // Convert numeric strings for known threshold keys
  if (keys[0] === 'thresholds' && /^\d+$/.test(String(value))) {
    current[lastKey] = parseInt(value as string, 10);
  } else {
    current[lastKey] = value;
  }
}

export function mergeConfigs(...sources: Record<string, unknown>[]): ConfigOptions {
  const result = JSON.parse(JSON.stringify(CONFIG_DEFAULTS)) as ConfigOptions;
  
  for (const source of sources) {
    if (!source) continue;
    
    for (const section of ['rules', 'thresholds', 'weights']) {
      if (source[section] && typeof source[section] === 'object') {
        // Deep merge pour chaque section
        for (const [key, value] of Object.entries(source[section] as Record<string, unknown>)) {
          (result as Record<string, unknown>)[section] = (result as Record<string, unknown>)[section] || {};
          ((result as Record<string, unknown>)[section] as Record<string, unknown>)[key] = value;
        }
      }
    }
    
    // Conserve les clÃ©s legacy
    for (const key of ['skip', 'ignore', 'autoPush', 'risk', 'staged']) {
      if (source[key] !== undefined) {
        (result as Record<string, unknown>)[key] = source[key];
      }
    }

    // Propagate ai config section (not in knownKeys)
    if (source.ai && typeof source.ai === 'object') {
      (result as Record<string, unknown>).ai = {
        ...((result as Record<string, unknown>).ai as Record<string, unknown>),
        ...(source.ai as Record<string, unknown>),
      };
    }
  }
  
  return result;
}

export function loadConfig(options: Record<string, unknown> = {}): ConfigOptions {
  const root = (options.root as string) || process.cwd();
  const cliArgs = (options.cliArgs as string[]) || process.argv.slice(2);

  // 1. Defaults
  let config: ConfigOptions = { ...CONFIG_DEFAULTS };

  // 2. package.json gitQuality
  try {
    const pkgPath = join(root, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (pkg.gitQuality) {
        config = mergeConfigs(config, pkg.gitQuality as Record<string, unknown>);
      }
    }
  } catch { /* ignore */ }

  // 3. YAML file
  const cliOverrides = parseCliOverrides(cliArgs);
  const configPath = (cliOverrides.config as string) || process.env.CQ_CONFIG || process.env.CQC_CONFIG || findConfigFile(root);
  if (configPath) {
    try {
      const yamlConfig = loadYamlFile(configPath);
      config = mergeConfigs(config, yamlConfig);
    } catch (e) {
      console.error(`Warning: Could not load config file '${configPath}': ${(e as Error).message}`);
    }
  }

  // 4. Env overrides
  const envOverrides = parseEnvOverrides();
  config = mergeConfigs(config, envOverrides);

  // 5. CLI overrides (highest priority)
  config = mergeConfigs(config, cliOverrides);

  // Validate
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return config;
}

export class ConfigError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`Configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

/** Construit la config AI depuis la config globale */
export function buildAiConfigFromConfig(config: Record<string, unknown>): AiConfig | null {
  const ai = config.ai as Record<string, unknown> | undefined;
  if (!ai?.provider) return null;
  const result: AiConfig = {
    provider: ai.provider as AiProviderName,
    timeoutMs: (ai.timeoutMs as number) ?? 10000,
    temperature: (ai.temperature as number) ?? 0.3,
  };
  const apiKey = (ai.apiKey as string) || process.env.CQ_AI_KEY || process.env.CQC_AI_KEY;
  if (apiKey) result.apiKey = apiKey;
  const baseUrl = ai.baseUrl as string;
  if (baseUrl) result.baseUrl = baseUrl;
  const model = ai.model as string;
  if (model) result.model = model;
  return result;
}

