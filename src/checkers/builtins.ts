import { LintChecker } from "./LintChecker.js";
import { FormatChecker } from "./FormatChecker.js";
import { CommitMsgChecker } from "./CommitMsgChecker.js";
import { SecurityChecker } from "./SecurityChecker.js";
import { TestChecker } from "./TestChecker.js";
import { PlaywrightChecker } from "./PlaywrightChecker.js";
import { SecretChecker } from "./SecretChecker.js";
import { TypecheckChecker } from "./TypecheckChecker.js";
import { BuildChecker } from "./BuildChecker.js";
import { DebugArtifactsChecker } from "./DebugArtifactsChecker.js";
import { NpmPackChecker } from "./NpmPackChecker.js";
import { RiskChecker } from "./RiskChecker.js";
import { ConventionalCommitChecker } from "./ConventionalCommitChecker.js";
import { CommitSizeChecker } from "./CommitSizeChecker.js";
import { WipCommitChecker } from "./WipCommitChecker.js";
import { BranchNamingChecker } from "./BranchNamingChecker.js";
import { SignedCommitChecker } from "./SignedCommitChecker.js";
import { MergeCommitChecker } from "./MergeCommitChecker.js";
import type { CheckerPlugin } from "../types.js";

export function createBuiltinCheckers() {
    return [
        new LintChecker(),
        new FormatChecker(),
        new CommitMsgChecker(),
        new SecretChecker(),
        new DebugArtifactsChecker(),
        new SecurityChecker(),
        new RiskChecker(),
        new TypecheckChecker(),
        new TestChecker(),
        new BuildChecker(),
        new NpmPackChecker(),
        new PlaywrightChecker(),
        new ConventionalCommitChecker(),
        new CommitSizeChecker(),
        new WipCommitChecker(),
        new BranchNamingChecker(),
        new SignedCommitChecker(),
        new MergeCommitChecker(),
    ];
}

export function createBuiltinPlugin(): CheckerPlugin {
    return {
        name: "builtin-checkers",
        checkers: createBuiltinCheckers,
    };
}

export function registerBuiltinCheckers<T extends { use: (plugin: CheckerPlugin) => T }>(engine: T): T {
    return engine.use(createBuiltinPlugin());
}
