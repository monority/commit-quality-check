# Metrics

## Global Score
Composite weighted score from all categories.

Formula: `(message_quality * message_weight + history_quality * history_weight + workflow_quality * workflow_weight) / 100`

## Message Quality (default weight: 40%)
Evaluates commit message quality.

**Formula**: Start at 100, apply penalties from checkers (conventional commit, WIP detection, subject length).

**Penalties**:
- Non-conventional commit message: -20
- WIP commit detected: -15
- Subject too short (<10 chars): -5
- Subject too long (>72 chars): -3

**Limits**: Cannot detect semantic accuracy of message content.

## History Quality (default weight: 40%)
Evaluates commit structure and history.

**Formula**: Start at 100, penalize large commits and test removals, bonus for test inclusion.

**Penalties**:
- Commit exceeds max_commit_lines: -(lines/max * 20), max -30
- Tests removed: -15
**Bonus**:
- Tests included: +5

## Workflow Quality (default weight: 20%)
Evaluates workflow compliance.

**Formula**: Start at 100, apply penalties from workflow checkers.
Covers: branch naming, signed commits, merge commits.

## Score Levels
- 90-100: Excellent
- 70-89: Good
- 50-69: Needs improvement
- 0-49: Poor
