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
- **conventional_commits** (bool, default: true) â€” Require Conventional Commits format
- **wip_commits** (bool, default: true) â€” Block WIP commit messages
- **branch_naming** (bool, default: true) â€” Validate branch naming convention
- **signed_commits** (bool, default: false) â€” Require GPG-signed commits

### thresholds
- **max_commit_lines** (int, min: 1, default: 500) â€” Max lines per commit
- **max_subject_length** (int, min: 1, default: 72) â€” Max subject line length

### weights
- **message_quality** (int, 0-100, default: 40) â€” Weight for message quality score
- **history_quality** (int, 0-100, default: 40) â€” Weight for history quality score
- **workflow_quality** (int, 0-100, default: 20) â€” Weight for workflow quality score
Weights must sum to 100.

## Priority Order (highest to lowest)
1. CLI flags (`--thresholds.max-commit-lines=200`)
2. Environment variables (`CQ_THRESHOLD_MAX_LINES=200`)
3. Config file (`commit-quality-check.yml`)
4. package.json (`gitQuality` key)
5. Built-in defaults

## Legacy Compatibility
The old `package.json` `gitQuality` format (skip, ignore, autoPush, risk) is still supported.
