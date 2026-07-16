# Plugins

## Built-in Checkers

| ID | Name | Category | Severity |
|----|------|----------|----------|
| linting | Linting (ESLint) | quality | error |
| formatting | Formatting (Prettier) | quality | warning |
| commit-message | Commit Message Quality | message | error |
| secret-scanner | Secret Scanner | security | error |
| debug-artifacts | Debug Artifacts | quality | warning |
| deps-vulnerabilities | Dependencies Vulnerabilities | security | error |
| risk-analysis | Risk Analysis | quality | warning |
| type-check | Type Check | quality | error |
| test-suite | Test Suite | quality | error |
| build | Build | quality | error |
| npm-pack | NPM Pack | quality | warning |
| playwright | Playwright Tests | quality | error |
| conventional-commit | Conventional Commit | message | error |
| commit-size | Commit Size | history | warning |
| wip-commit | WIP Commit | message | error |
| branch-naming | Branch Naming | workflow | warning |
| signed-commit | Signed Commit | workflow | warning |
| merge-commit | Merge Commit | history | info |

## Creating a Plugin

Each plugin implements the `CheckerPlugin` interface from `src/types.ts`:

```ts
// my-checker.ts
import type { CheckerPlugin, CheckResult } from './src/types.js';

const myChecker = {
  id: 'my-checker',
  name: 'My Custom Check',
  description: 'Checks something specific',
  category: 'quality',
  severity: 'warning',
  async run(context: { stagedFiles: string[] }): Promise<CheckResult> {
    return {
      checker: this.name,
      status: 'pass',
      message: 'Everything looks good',
    };
  },
} satisfies CheckerPlugin;

export default myChecker;
```
