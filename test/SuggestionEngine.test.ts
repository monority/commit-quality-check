import test from "node:test";
import assert from "node:assert/strict";
import { SuggestionEngine } from "../src/core/SuggestionEngine.js";
import type { DiffAnalysis, ScoreSummary } from "../src/types.js";

test("builds auth-focused commit suggestion", async () => {
  const engine = new SuggestionEngine();
  const suggestion = await engine.suggest(
    {
      files: ["src/auth/login.ts"],
      testFiles: [],
      signals: {
        hasDocumentation: false,
        hasSourceChanges: true,
        touchesCI: false,
        touchesMigrations: false,
        touchesAuth: true,
        touchesEnv: false,
        touchesDependencies: false,
      },
    } as DiffAnalysis,
    {
      probableType: "feat",
      probableScope: "auth",
      reasons: ["Auth-sensitive changes detected"],
    } as ScoreSummary,
  );

  assert.equal(suggestion.suggestedHeader, "feat(auth): update auth flow");
  assert.deepEqual(suggestion.rationale, ["Auth-sensitive changes detected"]);
});

test("builds docs suggestion without scope", async () => {
  const engine = new SuggestionEngine();
  const suggestion = await engine.suggest(
    {
      files: ["README.md"],
      testFiles: [],
      signals: {
        hasDocumentation: true,
        hasSourceChanges: false,
        touchesCI: false,
        touchesMigrations: false,
        touchesAuth: false,
        touchesEnv: false,
        touchesDependencies: false,
      },
    } as DiffAnalysis,
    {
      probableType: "docs",
      probableScope: "repo",
      reasons: [],
    } as ScoreSummary,
  );

  assert.equal(suggestion.suggestedHeader, "docs: update documentation");
});

test("builds test coverage suggestion when diff removes tests", async () => {
  const engine = new SuggestionEngine();
  const suggestion = await engine.suggest(
    {
      files: [],
      testFiles: [],
      signals: {
        hasDocumentation: false,
        hasSourceChanges: false,
        touchesCI: false,
        touchesMigrations: false,
        touchesAuth: false,
        touchesEnv: false,
        touchesDependencies: false,
        removesTests: true,
      },
    } as DiffAnalysis,
    {
      probableType: "test",
      probableScope: "repo",
      reasons: ["Removed tests detected in staged diff"],
    } as ScoreSummary,
  );

  assert.equal(suggestion.suggestedHeader, "test: update test coverage");
  assert.deepEqual(suggestion.rationale, ["Removed tests detected in staged diff"]);
});
