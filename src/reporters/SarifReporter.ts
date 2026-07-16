import type { TransparentScore, CheckResult, DiffAnalysis, CheckerSeverity } from '../types.js';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

export interface SarifReporterData {
  score?: TransparentScore;
  checkerResults?: CheckResult[];
  analysis?: DiffAnalysis;
}

export interface SarifReporterOptions {
  output?: string;
  [key: string]: unknown;
}

/**
 * SARIF Reporter — Format SARIF v2.1.0 pour intégration CI/IDE.
 */
export class SarifReporter {
  report(data: SarifReporterData, options: SarifReporterOptions = {}): string {
    const results: Array<{
      ruleId: string;
      level: string;
      message: { text: string };
      properties?: Record<string, unknown>;
    }> = [];

    // Convertir les checker failures en SARIF results
    if (data.checkerResults) {
      for (const r of data.checkerResults) {
        if (r.status === 'fail') {
          const severity = r.severity as CheckerSeverity | undefined;
          results.push({
            ruleId: r.checker || r.name || 'unknown',
            level: severity === 'error' ? 'error' : (severity === 'warning' ? 'warning' : 'note'),
            message: {
              text: r.message || `${r.checker || r.name || 'unknown'} check failed`,
            },
          });
        }
      }
    }

    // Convertir les pénalités en SARIF results
    if (data.score?.categories) {
      for (const cat of data.score.categories) {
        for (const p of cat.penalties || []) {
          results.push({
            ruleId: `penalty/${cat.category}`,
            level: 'warning',
            message: {
              text: `${p.reason} (impact: ${p.impact})`,
            },
            properties: {
              recommendation: p.recommendation,
              impact: p.impact,
            },
          });
        }
      }
    }

    const sarifLog = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'commit-quality-check',
            version: pkg.version,
            informationUri: 'https://github.com/monority/commit-quality-check',
          },
        },
        results,
        properties: {
          globalScore: data.score?.globalScore,
        },
      }],
    };

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(sarifLog, null, 2), 'utf8');
    }

    return JSON.stringify(sarifLog, null, 2);
  }
}
