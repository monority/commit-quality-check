import test from "node:test";
import assert from "node:assert/strict";

// Mock provider for unit testing
class MockAiProvider {
  constructor(private response: { alternatives: string[] } | null = null) {}

  async suggest() {
    if (!this.response) return null;
    return {
      alternatives: this.response.alternatives,
      feedback: 'Mock AI feedback',
      latencyMs: 42,
    };
  }
}

test("AI provider returns alternatives when configured", async () => {
  const provider = new MockAiProvider({
    alternatives: ["feat: add user login", "fix: resolve auth bug"],
  });

  const result = await provider.suggest({
    stagedFiles: ["src/auth.ts"],
    diffStats: { added: 10, removed: 0 },
    signals: { hasSourceChanges: true } as Record<string, boolean>,
    currentSuggestion: { type: "feat", scope: "auth", description: "update auth", header: "feat(auth): update auth" },
    rationale: ["Auth changes detected"],
  });

  assert.ok(result);
  assert.equal(result.alternatives.length, 2);
  assert.equal(result.latencyMs, 42);
});

test("AI provider returns null gracefully when not configured", async () => {
  const provider = new MockAiProvider(null);
  const result = await provider.suggest({
    stagedFiles: [],
    diffStats: { added: 0, removed: 0 },
    signals: {},
    currentSuggestion: { type: "chore", scope: "", description: "", header: "chore: update" },
    rationale: [],
  });
  assert.equal(result, null);
});

test("createAiProvider returns null when no config", async () => {
  const { createAiProvider } = await import("../src/ai/index.js");
  const provider = createAiProvider(null);
  assert.equal(provider, null);
});

test("createAiProvider returns null when config has no provider", async () => {
  const { createAiProvider } = await import("../src/ai/index.js");
  const provider = createAiProvider({} as never);
  assert.equal(provider, null);
});

test("AiError has correct properties", async () => {
  const { AiError } = await import("../src/ai/types.js");
  const err = new AiError("test error", "TIMEOUT", "openai");
  assert.equal(err.name, "AiError");
  assert.equal(err.code, "TIMEOUT");
  assert.equal(err.provider, "openai");
  assert.equal(err.message, "test error");
});
