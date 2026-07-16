import type { TransparentScore, CheckResult, DiffAnalysis } from '../types.js';

export interface MarkdownReporterData {
  score?: TransparentScore;
  checkerResults?: CheckResult[];
  analysis?: DiffAnalysis;
}

/**
 * Markdown Reporter — Génère quality-report.md
 */
export class MarkdownReporter {
  report(data: MarkdownReporterData, options: Record<string, unknown> = {}): string {
    let md = `# Quality Check Report\n\n`;
    md += `Generated on: ${new Date().toLocaleString()}\n\n`;

    // Score
    if (data.score) {
      md += `## Score\n\n`;
      md += `**Global Score: ${data.score.globalScore}/100**\n\n`;
      for (const cat of data.score.categories || []) {
        md += `- **${cat.label}**: ${cat.score}/100 (weight: ${cat.weight}%)\n`;
        for (const p of cat.penalties || []) {
          md += `  - ${p.reason} (${p.impact > 0 ? '+' : ''}${p.impact})\n`;
        }
      }
      md += '\n';
    }

    // Résultats checkers
    if (data.checkerResults) {
      md += `## Results\n\n`;
      md += `| Checker | Status | Message |\n`;
      md += `| :--- | :--- | :--- |\n`;
      for (const r of data.checkerResults) {
        const name = r.checker || r.name || 'unknown';
        const status = r.status === 'pass' ? 'PASS' : r.status === 'skip' ? 'SKIP' : 'FAIL';
        md += `| ${name} | ${status} | ${r.message || ''} |\n`;
      }
      md += '\n';
    }

    // Recommandations
    const recommendations = data.score?.recommendations;
    if (recommendations && recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      for (const rec of recommendations) {
        md += `- ${rec}\n`;
      }
    }

    return md;
  }
}
