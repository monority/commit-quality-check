# Configuration

## File: `commit-quality-check.yml`

Default config:

```yaml
rules:
  conventional_commits: true
  wip_commits: true
  branch_naming: true
  signed_commits: false

thresholds:
  max_commit_lines: 500
  max_subject_length: 72

weights:
  message_quality: 40
  history_quality: 40
  workflow_quality: 20
```

## Fields

### rules

- **conventional_commits** (bool, default: true) — Require Conventional Commits format
- **wip_commits** (bool, default: true) — Block WIP commit messages
- **branch_naming** (bool, default: true) — Validate branch naming convention
- **signed_commits** (bool, default: false) — Require GPG-signed commits

### thresholds

- **max_commit_lines** (int, min: 1, default: 500) — Max lines per commit
- **max_subject_length** (int, min: 1, default: 72) — Max subject line length

### weights

- **message_quality** (int, 0-100, default: 40) — Weight for message quality score
- **history_quality** (int, 0-100, default: 40) — Weight for history quality score
- **workflow_quality** (int, 0-100, default: 20) — Weight for workflow quality score
  Weights must sum to 100.

## Priority Order (highest to lowest)

1. CLI flags (`--thresholds.max-commit-lines=200`)
2. Environment variables (`CQ_THRESHOLD_MAX_LINES=200`)
3. Config file (`commit-quality-check.yml`)
4. package.json (`gitQuality` key)
5. Built-in defaults

## Legacy Compatibility

The old `package.json` `gitQuality` format (skip, ignore, autoPush, risk) is still supported.

## AI (optional)

Environment variables: `CQ_AI_PROVIDER` (`openai` | `anthropic` | `ollama`), `CQ_AI_KEY` (or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`).

Or in the YAML config:

```yaml
ai:
  provider: openai
  model: gpt-4o-mini
  temperature: 0.5
  timeoutMs: 15000
```

CLI override: `cq --ai openai suggest`. Without configuration the feature stays off.
