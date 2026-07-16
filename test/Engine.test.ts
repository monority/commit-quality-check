import test from "node:test";
import assert from "node:assert/strict";
import { QualityEngine } from "../src/core/Engine.js";
import { BaseChecker } from "../src/core/BaseChecker.js";
import type { CheckResult } from "../src/types.js";

class RegisteredChecker extends BaseChecker {
    constructor() {
        super("Registered Check");
    }

    async run(): Promise<CheckResult> {
        return { success: true, message: "ok" };
    }
}

test("loadCheckers skips discovery when checkers already registered", async () => {
    const engine = new QualityEngine();
    let discoverCalls = 0;

    engine.registry.discover = async () => {
        discoverCalls += 1;
        return engine.registry;
    };

    engine.registerChecker(new RegisteredChecker());
    await engine.loadCheckers();

    assert.equal(discoverCalls, 0);
    assert.deepEqual(
        engine.registry.allCheckers.map((checker) => checker.name),
        ["Registered Check"],
    );
});

test("loadCheckers does not auto-register builtins on empty engine (decoupled)", async () => {
    const engine = new QualityEngine();

    await engine.loadCheckers();

    // Engine no longer auto-registers builtins — call createQualityEngine() for that
    assert.deepEqual(
        engine.registry.allCheckers.map((checker) => checker.name),
        [],
    );
});

test("use registers plugin checkers through engine", () => {
    const engine = new QualityEngine();

    engine.use({
        name: "demo-plugin",
        checkers: [new RegisteredChecker()],
    });

    assert.deepEqual(
        engine.registry.allCheckers.map((checker) => checker.name),
        ["Registered Check"],
    );
    assert.deepEqual(
        engine.registry.allPlugins.map((plugin) => plugin.name),
        ["demo-plugin"],
    );
});