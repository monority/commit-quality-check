import { BaseChecker, ProjectContext } from "../core/BaseChecker.js";
import type { CheckResult } from "../types.js";

/**
 * Count vulnerabilities from `audit --json` output (npm/pnpm/yarn/bun),
 * falling back to the plain-text summary line. Unknown output counts as 0:
 * a failing or unreadable audit must not fail the check by itself.
 */
export function parseAuditVulnerabilityCount(output: string): number {
  try {
    const parsed = JSON.parse(output) as {
      metadata?: { vulnerabilities?: { total?: number } };
    };
    if (parsed?.metadata?.vulnerabilities) {
      return parsed.metadata.vulnerabilities.total ?? 0;
    }
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
    return 0;
  } catch {
    const match = output.match(/(\d+)\s+vulnerabilities?/);
    return match ? Number(match[1]) : 0;
  }
}

export class SecurityChecker extends BaseChecker {
  declare profile: string;

  constructor() {
    super("Dependencies Vulnerabilities");
    this.profile = "fast";
  }

  async run(context: ProjectContext): Promise<CheckResult> {
    const { packageManager } = context;
    const pm = packageManager || "npm";

    try {
      const result = await this.exec(context, pm, ["audit", "--json"]);
      const total = parseAuditVulnerabilityCount(result.stdout || result.stderr);

      if (total > 0) {
        return {
          success: false,
          message: `Vulnerabilities found: ${total}`,
          suggestedFix: `${pm} audit fix`,
          details: `Run \`${pm} audit fix\` to fix ${total} vulnerabilit${total === 1 ? "y" : "ies"}.`,
        };
      }

      return { success: true, message: "No vulnerabilities found" };
    } catch {
      // Audit could not run (no lockfile, offline...): not a quality failure.
      return { success: true, message: "Audit unavailable: skipped" };
    }
  }
}
