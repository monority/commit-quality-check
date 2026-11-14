import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager, readProjectPackage } from "../src/utils/ProjectUtils.js";

test("readProjectPackage returns an empty object when package.json is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-pkg-missing-"));
  try {
    const pkg = await readProjectPackage(root);
    assert.deepEqual(pkg, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readProjectPackage parses a valid package.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-pkg-valid-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
    const pkg = await readProjectPackage(root);
    assert.equal(pkg.name, "x");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detectPackageManager defaults to npm without package.json or lockfile", async () => {
  const root = await mkdtemp(join(tmpdir(), "cq-pm-missing-"));
  try {
    const pm = await detectPackageManager(root);
    assert.equal(pm, "npm");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
