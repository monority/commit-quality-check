# Architecture

## Overview
commit-quality-check is a modular Git commit quality CLI.

## Components

### Core Engine (`src/core/Engine.ts`)
Orchestrates the check pipeline: load config → analyze diff → run checkers → score → report.

### Configuration (`src/config/`)
- `schema.ts` — Schema definition, defaults, validation
- `loader.ts` — Multi-source config loader (YAML → package.json → env → CLI)

### Check Registry (`src/core/CheckRegistry.ts`)
Plugin registry with discovery, filtering, and external plugin loading.

### Checkers (`src/checkers/`)
Each checker implements the CheckerPlugin interface:
- `id` — unique identifier
- `name` — human-readable name
- `category` — message | history | workflow | security | quality
- `severity` — info | warning | error
- `run(context)` — async check function

### Scoring Engine (`src/core/ScoringEngine.ts`)
Transparent scoring with per-category breakdowns, traceable penalties, and recommendations.

### Reporters (`src/reporters/`)
- CliReporter — console output
- JsonReporter — CI-compatible JSON
- SarifReporter — SARIF v2.1.0
- MarkdownReporter — quality-report.md

## Data Flow
User commit → staged files → DiffAnalyzer → Checkers → ScoringEngine → Reporters → Output
