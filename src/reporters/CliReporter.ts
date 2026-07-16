import type { TransparentScore, CheckResult, DiffAnalysis } from '../types.js';

export interface CliReporterData {
  score?: TransparentScore;
  checkerResults?: CheckResult[];
  analysis?: DiffAnalysis;
}

/**
 * CLI Reporter — Sortie console structurée et colorée.
 */
export class CliReporter {
  report(data: CliReporterData, options: Record<string, unknown> = {}): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('  ╔══════════════════════════════════════╗');
    lines.push('  ║     Commit Quality Check Report      ║');
    lines.push('  ╚══════════════════════════════════════╝');
    lines.push('');

    // Score global
    const score = data.score?.globalScore ?? 'N/A';
    lines.push(`  Global Score: ${score}/100`);
    lines.push('');

    // Score par catégorie
    if (data.score?.categories) {
      for (const cat of data.score.categories) {
        const bar = this._progressBar(cat.score);
        lines.push(`  ${cat.label}: ${cat.score}/100 (weight: ${cat.weight}%)`);
        lines.push(`  ${bar}`);

        if (cat.penalties?.length > 0) {
          for (const p of cat.penalties) {
            lines.push(`    - ${p.reason} (${p.impact > 0 ? '+' : ''}${p.impact})`);
          }
        }
        lines.push('');
      }
    }

    // Résultats des checkers
    const checkerResults = data.checkerResults;
    if (checkerResults && checkerResults.length > 0) {
      lines.push('  ── Checkers ──');
      for (const r of checkerResults) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'skip' ? '○' : '✗';
        const name = r.checker || r.name || 'unknown';
        lines.push(`  ${icon} ${name}: ${r.message || r.status}`);
      }
      lines.push('');
    }

    // Recommandations
    const recommendations = data.score?.recommendations;
    if (recommendations && recommendations.length > 0) {
      lines.push('  ── Recommendations ──');
      for (const rec of recommendations) {
        lines.push(`  → ${rec}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  _progressBar(score: number, width: number = 20): string {
    const filled = Math.round(score / 100 * width);
    const empty = width - filled;
    return '  [' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}
