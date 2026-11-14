# Changelog

## 3.2.0 - 2026-11-14

### Added

- `cq json-check` now accepts `--profile fast|full`, `--reporters cli,json,sarif,markdown`, and `--output <dir>` flags.
- Environment variable support: `CQ_PROFILE`, `CQ_REPORTERS`, and `CQ_OUTPUT_DIR` are read by `cq json-check` (`CQ_CONFIG` was already supported by the config loader).
- `cq json-check` can now write report files (`report.json`, `report.sarif`, `quality-report.md`) via `--reporters` / `--output`, enabling real SARIF upload in CI.
- JSON payload of `json-check` now includes a `reportFiles` array listing written report files.

### Fixed

- `cq-disable debug` / `cq-disable secret` markers now silence the line **after** the comment, matching the documented usage (previously only the line containing the marker was ignored). Covered by regression tests for both checkers.
- Playwright checker no longer fails on projects without an e2e script: it skips when no e2e script exists, regardless of Playwright being installed (previously `cq check` failed on any project without Playwright).
- `cq report --reporters <list> --output <file>` flags were silently swallowed as positional arguments; they are now parsed (`--full` and bare reporter lists also supported).
- `cq` with no arguments no longer exits silently in non-TTY environments: the usage hint (`cq status | cq suggest | cq json | cq json-check`) is printed as documented.
- Husky is no longer required by the quick-start install: the generated hooks are self-contained (`core.hooksPath` runs them directly), verified with a bare install.
- commit-msg validation now checks the subject line only: multi-line commit messages (body, footers) were previously rejected by the hook.
- The npm/pnpm script runner no longer appends a bare `--` when no extra arguments are passed (`npm run typecheck --` forwarded a literal `--` to the script and made `tsc` fail).
- The GitHub Token secret pattern now requires a literal value: `github-token:` keys and `${{ github.token }}` workflow expressions no longer trigger false positives.
- `js-yaml` bumped from `^4.1.0` to `^4.3.2`, fixing 3 high-severity advisories (CVE-2026-59870 and related CPU-consumption issues) in a runtime dependency. `pnpm audit --prod` is now clean.
- Dependencies Vulnerabilities checker rewritten around `audit --json` with a tested parser (`parseAuditVulnerabilityCount`): fixes false positives from plain-text matching (e.g. audit errors containing the word "vulnerabilities") and treats an unreadable audit as a skip, not a failure.
- GitHub Action: SARIF upload path corrected to `report.sarif` (previously pointed to a never-generated `cq-output.sarif`).
- GitHub Action: score extraction now reads `scoreSummary.globalScore` from the actual JSON payload.
- GitHub Action: removed redundant PR annotation step duplicating the CLI's native `::warning` / `::notice` annotations.
- Example workflow now references the existing `@v3` action tag instead of a non-existent `@v4`.
- CI no longer uploads `cq-output.json` / `report.sarif` artifacts that the test job never produces.

### Removed

- `.opencode/` directory (editor agent scaffolding unrelated to the package).
- `.npmignore` (redundant with the `files` field in `package.json`).
- `typedoc.json` and the broken "API Documentation" README section (no TypeDoc tooling was installed).
- `husky` moved from `dependencies` to `devDependencies` — the CLI never imports it at runtime.

### Changed

- Husky hooks are now generated with the project's detected package manager (`npm exec`, `pnpm exec`, `yarn exec`, or `bun exec`). Hook validation accepts hooks written for any of them.
- `cq` now dogfoods its own checkers: `lint` and `test:coverage` npm scripts added; CI runs lint, format check, and coverage (Node 24).
- `engines.node` raised from `>=18` to `>=20` and CI matrix now tests Node 20/22/24 accordingly.
- `CQ_DEBUG=1` prints the full stack trace when the engine fails (previously message only).
- `QualityEngine.loadCheckers()` now registers the built-in checkers when the registry is empty instead of only warning.
- README rewritten: sober structure, no marketing bullets, single source of truth per topic (features, checks, configuration), badges reduced to CI/npm/license. Removed the unused `logo-commit.svg`.
- GitHub repository furniture added: SECURITY.md, issue templates, PR template, CODEOWNERS.
- Console output no longer uses emoji: plain-text messages in logs and `[PASS]` / `[SKIP]` / `[FAIL]` labels in the CLI reporter. Fixes mojibake emoji literals in `Engine.ts` and keeps terminal output encoding-safe.
- Package version references aligned: GitLab template and example workflow now use the stable `v3` major tag.
- Author email placeholder removed from `package.json`.
- Fixed mojibake in `CONFIGURATION.md`, `build.mjs`, and `test/Config.test.ts`.

### Validation

- `pnpm run typecheck` — 0 errors
- `pnpm test` — 185/185 pass
- `pnpm run build` — OK
- Functional tests on a scratch project: hooks, commit-msg validation, `json-check --reporters sarif`, JSON payload keys.

## 3.1.0 - 2026-07-16

### Cleanup

- `cqc` binary removed — `cq` is now the sole CLI command.
- All references to `cqc` in source, docs, CI templates, and tests migrated to `cq`.
- Environment variables renamed: `CQC_*` → `CQ_*` (backward compat fallback kept).
- Internal log prefixes changed: `[cqc:ai]` → `[cq:ai]`, `[cqc]` → `[cq]`.
- `.github/workflows/cqc-analysis.yml` renamed to `cq-analysis.yml`.
- `cq` root wrapper fixed to point to `dist/scripts/cli.js`.
- `package.json` `bin.cqc` entry removed.

### Fixed

- `readProjectPackageFile()` now strips UTF-8 BOM from `package.json` before parsing, preventing JSON parse crashes on BOM-emitting editors.
- `cq menu` no longer hangs in non-TTY environments — graceful exit with usage hint.

### Validation

- `pnpm run build` — OK
- `pnpm test` — 185/185 pass
- `tsc --noEmit` — 0 errors
- `node cq status` — functional test OK

## 3.0.5 - 2026-05-31

### Changed

- npm package renamed from `commitiq-engine` back to `commit-quality-check` for better discoverability.
- CLI binary updated from `commitiq-engine` to `commit-quality-check`.
- README updated to reflect new package name in installation commands, overview, and repository links.
- Repository URLs updated to `monority/commit-quality-check`.
- GitHub Actions release publish step now authenticates to npm with repository secret `NPM_TOKEN`, so tagged releases can publish package from CI.

### Validation

- `npm test`
- `npm pack --dry-run`

## 3.0.3 - 2026-05-12

### Changed

- Improved npm discoverability metadata with stronger search-oriented description and keywords such as `git-hooks`, `commit-msg`, `staged-files`, and `conventional-commits`.
- README overview and features now describe CommitIQ Engine as a pre-commit, commit-msg, and Husky-oriented git-hook CLI.

### Validation

- `npm install --package-lock-only`
- `npm pack --dry-run`
- `npm test`

## 3.0.1 - 2026-05-12

### Fixed

- Restored backward-compatible `cqc` npm alias so stale local shims and older hook setups do not break after rename to `cq`.
- Status logic now accepts Husky-managed `core.hooksPath` values `.husky` and `.husky/_`.
- Package metadata and README repository links now point to canonical GitHub repository.

### Validation

- `npm exec -- cq status`
- `npm exec -- cqc status`
- `npm pack --dry-run`
- `npm test`

## 3.0.0 - 2026-05-11

### Breaking

- npm package renamed from `commit-polish` to `commitiq-engine`.
- Primary CLI command changed from `cqc` to `cq`.
- GitHub repository target renamed from `monority/commit-polish` to `monority/commitiq-engine`.

### Changed

- Public branding now uses CommitIQ Engine across package metadata, docs, reports, and scaffold output.
- Generated Husky hooks now call `cq` commands.
- Ignore annotations are now documented as `cq-disable`, while runtime remains backward-compatible with existing `cqc-disable` comments.

### Validation

- `node --test ./test/BuildOutput.test.js ./test/CliHooks.test.js`
- `npm install --package-lock-only`
- `npm test`

## 2.0.0 - 2026-05-11

### Breaking

- npm package renamed from `commit-quality-check` to `commit-polish`.
- GitHub repository target renamed from `monority/tools-commit-quality-check` to `monority/commit-polish`.

### Added

- Interactive `cqc commit` flow for TTY sessions: accept suggestion, edit message, or cancel.
- `cqc json`, `cqc json-check`, and `cqc json-check --full` for CI and machine-readable consumers.
- Diff-aware staged analysis for deleted test files and removed test lines.
- Richer `quality-report.md` with suggested commit, score summary, diff analysis, and fix guidance.

### Changed

- Release metadata now reflects premium Commit Polish branding while keeping `cqc` CLI stable.
- Risk scoring now penalizes test removals and exposes them in report, JSON, and suggestion flows.
- README and implementation summary aligned with final runtime behavior and release identity.

### Validation

- `node --test ./test/CliHooks.test.js`
- `node --test ./test/Reporter.test.js ./test/Engine.test.js`
- `npm test`
