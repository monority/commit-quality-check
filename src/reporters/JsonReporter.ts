import type { TransparentScore, CheckResult, DiffAnalysis } from '../types.js';
import { writeFileSync } from 'node:fs';

export interface JsonReporterData {
  score?: TransparentScore;
  checkerResults?: CheckResult[];
  analysis?: DiffAnalysis;
}

export interface JsonReporterOptions {
  output?: string;
  [key: string]: unknown;
}

/**
 * JSON Reporter — Payload JSON structuré pour CI.
 */
export class JsonReporter {
  report(data: JsonReporterData, options: JsonReporterOptions = {}): string {
    const payload = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      score: data.score ? {
        global: data.score.globalScore,
        categories: data.score.categories?.map(c => ({
          category: c.category,
          label: c.label,
          score: c.score,
          weight: c.weight,
          weightedScore: c.weightedScore,
          penalties: c.penalties,
          breakdown: c.breakdown,
        })),
        recommendations: data.score.recommendations,
      } : null,
      checkers: data.checkerResults ? {
        total: data.checkerResults.length,
        passed: data.checkerResults.filter(r => r.status === 'pass').length,
        failed: data.checkerResults.filter(r => r.status === 'fail').length,
        skipped: data.checkerResults.filter(r => r.status === 'skip').length,
        results: data.checkerResults,
      } : null,
      analysis: data.analysis ? {
        files: data.analysis.files?.length || 0,
        addedLines: data.analysis.lineStats?.added || 0,
        removedLines: data.analysis.lineStats?.removed || 0,
        signals: data.analysis.signals || {},
      } : null,
    };

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(payload, null, 2), 'utf8');
    }

    return JSON.stringify(payload, null, 2);
  }
}
