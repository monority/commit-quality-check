export interface DiffSignals {
  hasSourceChanges: boolean;
  hasTests: boolean;
  hasDocumentation: boolean;
  touchesConfig: boolean;
  touchesCI: boolean;
  touchesDependencies: boolean;
  touchesLockfiles: boolean;
  touchesEnv: boolean;
  touchesAuth: boolean;
  touchesMigrations: boolean;
  removesTests: boolean;
}

export interface DiffAnalysis {
  files: string[];
  sourceFiles: string[];
  testFiles: string[];
  deletedFiles: string[];
  deletedTestFiles: string[];
  removedTestLines: string[];
  lineStats: { added: number; removed: number };
  documentationFiles: string[];
  configFiles: string[];
  ciFiles: string[];
  dependencyFiles: string[];
  lockfileFiles: string[];
  envFiles: string[];
  authFiles: string[];
  migrationFiles: string[];
  topLevelAreas: string[];
  workspaceScopes: string[];
  signals: DiffSignals;
}

export interface Penalty {
  reason: string;
  impact: number;
  recommendation?: string;
}

export interface CategoryScore {
  category: string;
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  penalties: Penalty[];
  breakdown: Array<{ label: string; value: number }>;
}

export interface TransparentScore {
  globalScore: number;
  categories: CategoryScore[];
  recommendations: string[];
  weights: { message_quality: number; history_quality: number; workflow_quality: number };
}

export type TestsStatus = 'PRESENT' | 'MISSING' | 'REDUCED' | 'NOT_NEEDED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CheckerCategory = 'message' | 'history' | 'workflow' | 'security' | 'quality';
export type CheckerSeverity = 'info' | 'warning' | 'error';
export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface ScoreSummary {
  probableType: string;
  probableScope: string;
  atomicity: number;
  scopePrecision: number;
  testCoverage: number;
  testsStatus: TestsStatus;
  riskScore: number;
  riskLevel: RiskLevel;
  globalScore: number;
  reasons: string[];
  transparentScore?: TransparentScore;
}

export interface SuggestionSummary {
  type: string;
  scope: string;
  description: string;
  suggestedHeader: string;
  rationale: string[];
}

export interface CheckResult {
  name?: string;
  checker?: string;
  category?: CheckerCategory;
  severity?: CheckerSeverity;
  success: boolean;
  status?: CheckStatus;
  message: string;
  suggestedFix?: string;
  details?: string;
  penalties?: Array<{ reason: string; impact: number; recommendation?: string }>;
}

export interface ProjectConfig {
  root: string;
  projectPackage: Record<string, unknown>;
  packageManager: string;
  stagedFiles: string[];
  skip?: string[];
  generateReport?: boolean;
  quiet?: boolean;
}

export interface CheckerPlugin {
  name?: string;
  id?: string;
  description?: string;
  category?: CheckerCategory;
  severity?: CheckerSeverity;
  checkers: () => unknown[];
}
