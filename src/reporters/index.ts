import type { TransparentScore, CheckResult, DiffAnalysis } from '../types.js';
import { writeFileSync } from 'node:fs';
import { CliReporter } from './CliReporter.js';
import { JsonReporter } from './JsonReporter.js';
import { SarifReporter } from './SarifReporter.js';
import { MarkdownReporter } from './MarkdownReporter.js';

export { CliReporter } from './CliReporter.js';
export { JsonReporter } from './JsonReporter.js';
export { SarifReporter } from './SarifReporter.js';
export { MarkdownReporter } from './MarkdownReporter.js';

export interface DispatchData {
  score?: TransparentScore;
  checkerResults?: CheckResult[];
  analysis?: DiffAnalysis;
}

export interface DispatchOptions {
  reporters?: string[];
  files?: Record<string, string>;
  [key: string]: unknown;
}

export class ReportDispatcher {
  reporters: Record<string, CliReporter | JsonReporter | SarifReporter | MarkdownReporter>;

  constructor() {
    this.reporters = {
      cli: new CliReporter(),
      json: new JsonReporter(),
      sarif: new SarifReporter(),
      markdown: new MarkdownReporter(),
    };
  }

  dispatch(data: DispatchData, options: DispatchOptions = {}): { outputs: Record<string, string>; files: string[] } {
    const selected = options.reporters || ['cli'];
    const outputs: Record<string, string> = {};
    const files: string[] = [];

    for (const name of selected) {
      const reporter = this.reporters[name];
      if (!reporter) continue;

      const output = reporter.report(data, options);
      outputs[name] = output;

      if (options.files?.[name]) {
        writeFileSync(options.files[name], output, 'utf8');
        files.push(options.files[name]);
      } else if (name === 'cli') {
        console.log(output);
      }
    }

    return { outputs, files };
  }
}
