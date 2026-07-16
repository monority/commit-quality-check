export interface NormalizedConfig {
  staged: { prettier: boolean; eslint: boolean };
  skip: string[];
  ignore: string[];
  autoPush: boolean;
  risk: { failOn: string | null };
}

export function normalizeGitQualityConfig(config: Record<string, unknown> = {}): NormalizedConfig {
  const staged = config.staged as Record<string, unknown> | undefined;
  const prettierVal = staged?.prettier;
  const eslintVal = staged?.eslint;
  return {
    staged: {
      prettier: (prettierVal === undefined || prettierVal === null) ? true : Boolean(prettierVal),
      eslint: (eslintVal === undefined || eslintVal === null) ? true : Boolean(eslintVal),
    },
    skip: Array.isArray(config.skip) ? config.skip as string[] : [],
    ignore: Array.isArray(config.ignore) ? config.ignore as string[] : [],
    autoPush: config.autoPush === true,
    risk: {
      failOn: normalizeRiskFailOn((config.risk as Record<string, unknown> | undefined)?.failOn),
    },
  };
}

function normalizeRiskFailOn(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return ["LOW", "MEDIUM", "HIGH"].includes(normalized) ? normalized : null;
}
