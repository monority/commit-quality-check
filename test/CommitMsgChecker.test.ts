import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommitMsgChecker } from "../src/checkers/CommitMsgChecker.js";
import type { ProjectContext } from "../src/core/BaseChecker.js";

async function checkMessage(content: string): Promise<{ success: boolean; message: string }> {
  const root = await mkdtemp(join(tmpdir(), "cq-commit-msg-"));
  const checker = new CommitMsgChecker();
  try {
    const msgPath = join(root, "COMMIT_EDITMSG");
    await writeFile(msgPath, content);
    return await checker.run({ root, commitMsgPath: msgPath } as ProjectContext);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts a conventional subject without body", async () => {
  const result = await checkMessage("feat: add login\n");
  assert.equal(result.success, true);
});

test("accepts a conventional subject with a multi-line body", async () => {
  const result = await checkMessage(
    "feat: add login\n\nLong body line exceeding seventy-two characters for sure yes.\n- item one\n",
  );
  assert.equal(result.success, true);
});

test("accepts a gitmoji subject", async () => {
  const result = await checkMessage(":art: format files");
  assert.equal(result.success, true);
});

test("rejects a non-conventional subject", async () => {
  const result = await checkMessage("work in progress");
  assert.equal(result.success, false);
});

test("rejects an invalid subject even when the body is fine", async () => {
  const result = await checkMessage("some random subject\n\nfeat: looks good in body");
  assert.equal(result.success, false);
});
