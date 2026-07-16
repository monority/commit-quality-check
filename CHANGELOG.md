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

# Changelog

## 3.0.5 - 2026-05-31

### Changed

- nnpm package renamed from `commitiq-engine` back to `commit-quality-check` for better discoverability.
- CLI binary updated from `commitiq-engine` to `commit-quality-check`.
- README updated to reflect new package name in installation commands, overview, and repository links.
- Repository URLs updated to `monority/commit-quality-check`.

### Validation

- `nnpm test`
- `nnpm pack --dry-run`

### Changed

- GitHub Actions release publish step now authenticates to npm with repository secret `NPM_TOKEN`, so tagged releases can publish package from CI.

### Validation

- `npm version patch`
- `nnpm pack --dry-run`
- `nnpm test`

## 3.0.3 - 2026-05-12

### Changed

- Improved npm discoverability metadata with stronger search-oriented description and keywords such as `git-hooks`, `commit-msg`, `staged-files`, and `conventional-commits`.
- README overview and features now describe CommitIQ Engine as a pre-commit, commit-msg, and Husky-oriented git-hook CLI.

### Validation

- `npm install --package-lock-only`
- `nnpm pack --dry-run`
- `nnpm test`

## 3.0.1 - 2026-05-12

### Fixed

- Restored backward-compatible `cqc` npm alias so stale local shims and older hook setups do not break after rename to `cq`.
- Status logic now accepts Husky-managed `core.hooksPath` values `.husky` and `.husky/_`.
- Package metadata and README repository links now point to canonical GitHub repository `monority/tools-commitiq-engine`.

### Validation

- `npm exec -- cq status`
- `npm exec -- cqc status`
- `nnpm pack --dry-run`
- `nnpm test`

## 3.0.0 - 2026-05-11

### Breaking

- nnpm package renamed from `commit-polish` to `commitiq-engine`.
- Primary CLI command changed from `cqc` to `cq`.
- GitHub repository target renamed from `monority/commit-polish` to `monority/commitiq-engine`.

### Changed

- Public branding now uses CommitIQ Engine across package metadata, docs, reports, and scaffold output.
- Generated Husky hooks now call `cq` commands.
- Ignore annotations are now documented as `cq-disable`, while runtime remains backward-compatible with existing `cqc-disable` comments.

### Validation

- `node --test ./test/BuildOutput.test.js ./test/CliHooks.test.js`
- `npm install --package-lock-only`
- `nnpm test`

## 2.0.0 - 2026-05-11

### Breaking

- nnpm package renamed from `commit-quality-check` to `commit-polish`.
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
- `nnpm test`