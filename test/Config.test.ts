import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGitQualityConfig } from "../src/core/Config.js";
import { CONFIG_DEFAULTS, validateConfig, configSchema, type ConfigOptions } from "../src/config/schema.js";
import {
  parseCliOverrides,
  parseEnvOverrides,
  mergeConfigs,
  loadConfig,
  ConfigError,
  findConfigFile,
  CONFIG_FILENAMES,
} from "../src/config/loader.js";
import yaml from 'js-yaml';
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// â”€â”€ Legacy Config tests (existing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("normalizes gitQuality config with defaults", () => {
    const config = normalizeGitQualityConfig();

    assert.deepEqual(config, {
        staged: {
            prettier: true,
            eslint: true,
        },
        skip: [],
        ignore: [],
        autoPush: false,
        risk: {
            failOn: null,
        },
    });
});

test("normalizes gitQuality config with explicit values", () => {
    const config = normalizeGitQualityConfig({
        staged: {
            prettier: false,
            eslint: true,
        },
        skip: ["Debug Artifacts"],
        ignore: ["generated/"],
        autoPush: true,
        risk: {
            failOn: "medium",
        },
    });

    assert.deepEqual(config, {
        staged: {
            prettier: false,
            eslint: true,
        },
        skip: ["Debug Artifacts"],
        ignore: ["generated/"],
        autoPush: true,
        risk: {
            failOn: "MEDIUM",
        },
    });
});

// â”€â”€ Schema / Validation tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("validateConfig accepts empty config", () => {
    const errors = validateConfig({});
    assert.deepEqual(errors, []);
});

test("validateConfig accepts valid rules", () => {
    const errors = validateConfig({
        rules: { conventional_commits: false, wip_commits: true },
    });
    assert.deepEqual(errors, []);
});

test("validateConfig rejects unknown rule", () => {
    const errors = validateConfig({
        rules: { unknown_rule: true },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Unknown rule 'unknown_rule'/);
});

test("validateConfig rejects non-boolean rule", () => {
    const errors = validateConfig({
        rules: { conventional_commits: "yes" },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Rule 'conventional_commits' must be boolean/);
});

test("validateConfig rejects unknown threshold", () => {
    const errors = validateConfig({
        thresholds: { unknown_threshold: 10 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Unknown threshold 'unknown_threshold'/);
});

test("validateConfig rejects negative threshold", () => {
    const errors = validateConfig({
        thresholds: { max_commit_lines: -1 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Threshold 'max_commit_lines' must be a positive number/);
});

test("validateConfig rejects zero threshold", () => {
    const errors = validateConfig({
        thresholds: { max_commit_lines: 0 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Threshold 'max_commit_lines' must be a positive number/);
});

test("validateConfig rejects unknown weight", () => {
    const errors = validateConfig({
        weights: { unknown_weight: 10 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Unknown weight 'unknown_weight'/);
});

test("validateConfig rejects non-integer weight", () => {
    const errors = validateConfig({
        weights: { message_quality: 40.5 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Weight 'message_quality' must be an integer/);
});

test("validateConfig rejects weight out of range", () => {
    const errors = validateConfig({
        weights: { message_quality: 150 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Weight 'message_quality' must be an integer between 0 and 100/);
});

test("validateConfig rejects weights that do not sum to 100", () => {
    const errors = validateConfig({
        weights: { message_quality: 50, history_quality: 50, workflow_quality: 50 },
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Weights must sum to 100, currently sum to 150/);
});

test("validateConfig accepts legacy keys without error", () => {
    const errors = validateConfig({
        skip: ["Debug Artifacts"],
        ignore: ["generated/"],
        autoPush: true,
        risk: { failOn: "HIGH" },
    });
    assert.deepEqual(errors, []);
});

// â”€â”€ Defaults tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("CONFIG_DEFAULTS has correct structure", () => {
    assert.deepEqual(CONFIG_DEFAULTS.rules, {
        conventional_commits: true,
        wip_commits: true,
        branch_naming: true,
        signed_commits: false,
    });
    assert.deepEqual(CONFIG_DEFAULTS.thresholds, {
        max_commit_lines: 500,
        max_subject_length: 72,
    });
    assert.deepEqual(CONFIG_DEFAULTS.weights, {
        message_quality: 40,
        history_quality: 40,
        workflow_quality: 20,
    });
});

test("configSchema describes all fields", () => {
    assert.ok(configSchema.rules);
    assert.ok(configSchema.thresholds);
    assert.ok(configSchema.weights);
    assert.equal(Object.keys(configSchema.rules).length, 4);
    assert.equal(Object.keys(configSchema.thresholds).length, 2);
    assert.equal(Object.keys(configSchema.weights).length, 3);
});

// â”€â”€ YAML parsing tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("loadYamlFile parses nested YAML correctly", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-yaml-nested-"));
    try {
        await writeFile(join(root, "test.yml"), `
rules:
  conventional_commits: true
  wip_commits: false
  nested:
    key: value
thresholds:
  max_commit_lines: 300
`);
        const { loadYamlFile } = await import("../src/config/loader.js");
        const result = loadYamlFile(join(root, "test.yml"));
        assert.equal(result.rules.conventional_commits, true);
        assert.equal(result.rules.wip_commits, false);
        assert.deepEqual(result.rules.nested, { key: 'value' });
        assert.equal(result.thresholds.max_commit_lines, 300);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadYamlFile handles comments and empty lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-yaml-comments-"));
    try {
        await writeFile(join(root, "test.yml"), `
# This is a comment
rules:
  # Another comment
  conventional_commits: true

thresholds:
  max_commit_lines: 200
`);
        const { loadYamlFile } = await import("../src/config/loader.js");
        const result = loadYamlFile(join(root, "test.yml"));
        assert.deepEqual(result.rules, { conventional_commits: true });
        assert.deepEqual(result.thresholds, { max_commit_lines: 200 });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadYamlFile handles deep nesting", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-yaml-deep-"));
    try {
        await writeFile(join(root, "test.yml"), `
rules:
  conventional_commits: true
  complex:
    level1:
      level2:
        key: value
`);
        const { loadYamlFile } = await import("../src/config/loader.js");
        const result = loadYamlFile(join(root, "test.yml"));
        assert.equal(result.rules.complex.level1.level2.key, 'value');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// â”€â”€ CLI overrides tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("parseCliOverrides handles --key=value", () => {
    const result = parseCliOverrides(["--thresholds.max-commit-lines=200"]);
    assert.deepEqual(result, {
        thresholds: { max_commit_lines: 200 },
    });
});

test("parseCliOverrides handles --key value", () => {
    const result = parseCliOverrides(["--config", "my-config.yml"]);
    assert.deepEqual(result, { config: "my-config.yml" });
});

test("parseCliOverrides handles boolean flags", () => {
    const result = parseCliOverrides(["--full"]);
    assert.deepEqual(result, { full: true });
});

test("parseCliOverrides handles multiple flags", () => {
    const result = parseCliOverrides([
        "--thresholds.max-commit-lines=200",
        "--skip", "eslint,prettier",
        "--full",
    ]);
    assert.equal(result.thresholds.max_commit_lines, 200);
    assert.equal(result.skip, "eslint,prettier");
    assert.equal(result.full, true);
});

// â”€â”€ Env overrides tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("parseEnvOverrides reads CQ_THRESHOLD_MAX_LINES", () => {
    const original = process.env.CQ_THRESHOLD_MAX_LINES;
    try {
        process.env.CQ_THRESHOLD_MAX_LINES = "300";
        const result = parseEnvOverrides();
        assert.equal(result.thresholds.max_commit_lines, 300);
    } finally {
        if (original === undefined) delete process.env.CQ_THRESHOLD_MAX_LINES;
        else process.env.CQ_THRESHOLD_MAX_LINES = original;
    }
});

test("parseEnvOverrides reads CQ_SKIP", () => {
    const original = process.env.CQ_SKIP;
    try {
        process.env.CQ_SKIP = "eslint,prettier";
        const result = parseEnvOverrides();
        assert.deepEqual(result.skip, ["eslint", "prettier"]);
    } finally {
        if (original === undefined) delete process.env.CQ_SKIP;
        else process.env.CQ_SKIP = original;
    }
});

test("parseEnvOverrides reads CQ_RULES_CONVENTIONAL_COMMITS", () => {
    const original = process.env.CQ_RULES_CONVENTIONAL_COMMITS;
    try {
        process.env.CQ_RULES_CONVENTIONAL_COMMITS = "false";
        const result = parseEnvOverrides();
        assert.equal(result.rules.conventional_commits, false);
    } finally {
        if (original === undefined) delete process.env.CQ_RULES_CONVENTIONAL_COMMITS;
        else process.env.CQ_RULES_CONVENTIONAL_COMMITS = original;
    }
});

// â”€â”€ Merge configs tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("mergeConfigs applies defaults when no sources", () => {
    const result = mergeConfigs();
    assert.deepEqual(result.rules, CONFIG_DEFAULTS.rules);
    assert.deepEqual(result.thresholds, CONFIG_DEFAULTS.thresholds);
    assert.deepEqual(result.weights, CONFIG_DEFAULTS.weights);
});

test("mergeConfigs overrides with later sources", () => {
    const result = mergeConfigs(
        { rules: { conventional_commits: false } },
        { thresholds: { max_commit_lines: 200 } },
    );
    assert.equal(result.rules.conventional_commits, false);
    assert.equal(result.thresholds.max_commit_lines, 200);
    assert.equal(result.weights.message_quality, 40); // default preserved
});

test("mergeConfigs preserves legacy keys", () => {
    const result = mergeConfigs(
        { skip: ["Debug Artifacts"], autoPush: true },
    );
    assert.deepEqual(result.skip, ["Debug Artifacts"]);
    assert.equal(result.autoPush, true);
});

// â”€â”€ loadConfig integration tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("loadConfig returns defaults for empty project", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-empty-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        const config = loadConfig({ root, cliArgs: [] });
        assert.deepEqual(config.rules, CONFIG_DEFAULTS.rules);
        assert.deepEqual(config.thresholds, CONFIG_DEFAULTS.thresholds);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig reads gitQuality from package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-pkg-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({
            name: "test",
            version: "1.0.0",
            gitQuality: {
                skip: ["Debug Artifacts"],
                autoPush: true,
            },
        }));
        const config = loadConfig({ root, cliArgs: [] });
        assert.deepEqual(config.skip, ["Debug Artifacts"]);
        assert.equal(config.autoPush, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig reads YAML config file", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-yaml-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        await writeFile(join(root, "commit-quality-check.yml"), `
rules:
  conventional_commits: false
thresholds:
  max_commit_lines: 300
`);
        const config = loadConfig({ root, cliArgs: [] });
        assert.equal(config.rules.conventional_commits, false);
        assert.equal(config.thresholds.max_commit_lines, 300);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig CLI overrides take priority over YAML", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-cli-priority-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        await writeFile(join(root, "commit-quality-check.yml"), `
thresholds:
  max_commit_lines: 300
`);
        const config = loadConfig({ root, cliArgs: ["--thresholds.max-commit-lines=500"] });
        assert.equal(config.thresholds.max_commit_lines, 500);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig throws ConfigError on invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-invalid-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        assert.throws(
            () => loadConfig({ root, cliArgs: ["--weights.message-quality=200"] }),
            ConfigError,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ConfigError contains error messages", () => {
    const err = new ConfigError(["error1", "error2"]);
    assert.equal(err.name, "ConfigError");
    assert.deepEqual(err.errors, ["error1", "error2"]);
    assert.match(err.message, /error1/);
    assert.match(err.message, /error2/);
});

// â”€â”€ Retro-compatibility tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("loadConfig accepts legacy package.json.gitQuality.skip", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-legacy-skip-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({
            name: "test",
            version: "1.0.0",
            gitQuality: {
                skip: ["Debug Artifacts", "Playwright Tests"],
                ignore: ["generated/"],
                autoPush: true,
                risk: { failOn: "HIGH" },
            },
        }));
        const config = loadConfig({ root, cliArgs: [] });
        assert.deepEqual(config.skip, ["Debug Artifacts", "Playwright Tests"]);
        assert.deepEqual(config.ignore, ["generated/"]);
        assert.equal(config.autoPush, true);
        assert.deepEqual(config.risk, { failOn: "HIGH" });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// â”€â”€ Config file not found tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("findConfigFile returns null when no config file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-notfound-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        const found = findConfigFile(root);
        assert.equal(found, null);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("findConfigFile finds .yml file", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-find-yml-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        await writeFile(join(root, "commit-quality-check.yml"), "rules:\n  conventional_commits: true\n");
        const found = findConfigFile(root);
        assert.ok(found);
        assert.match(found, /commit-quality-check\.yml$/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("findConfigFile finds .yaml file", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-find-yaml-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        await writeFile(join(root, "commit-quality-check.yaml"), "rules:\n  conventional_commits: true\n");
        const found = findConfigFile(root);
        assert.ok(found);
        assert.match(found, /commit-quality-check\.yaml$/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig does not error when config file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-no-file-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        // No YAML file â€” should not throw
        const config = loadConfig({ root, cliArgs: [] });
        assert.ok(config.rules);
        assert.ok(config.thresholds);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loadConfig with explicit --config path that does not exist logs warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "cq-config-bad-path-"));
    try {
        await writeFile(join(root, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
        // Should not throw, just log warning and use defaults
        const config = loadConfig({ root, cliArgs: ["--config", "/nonexistent/config.yml"] });
        assert.ok(config.rules);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// â”€â”€ CONFIG_FILENAMES export test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test("CONFIG_FILENAMES contains expected filenames", () => {
    assert.deepEqual(CONFIG_FILENAMES, ["commit-quality-check.yml", "commit-quality-check.yaml"]);
});

