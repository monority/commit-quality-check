import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaywrightChecker } from "../src/checkers/PlaywrightChecker.js";
import type { ProjectContext } from "../src/core/BaseChecker.js";

test("passes with skip message when no e2e script exists, even without Playwright", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-playwright-no-e2e-"));
  const checker = new PlaywrightChecker();

  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "tmp", version: "1.0.0" }));

    const result = await checker.run({
      root,
      packageManager: "npm",
      projectPackage: { name: "tmp", version: "1.0.0" },
    } as unknown as ProjectContext);

    assert.equal(result.success, true);
    assert.equal(result.message, "No e2e script found");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("has correct metadata", () => {
  const checker = new PlaywrightChecker();
  assert.equal(checker.name, "Playwright Tests");
  assert.equal(checker.profile, "full");
});
