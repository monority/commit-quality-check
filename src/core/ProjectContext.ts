import type { DiffAnalysis, ScoreSummary, TransparentScore, SuggestionSummary } from '../types.js';
import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ConfigOptions } from '../config/schema.js';
import { normalizeGitQualityConfig } from "./Config.js";
import { loadConfig, buildAiConfigFromConfig } from "../config/loader.js";
import { createAiProvider } from '../ai/index.js';
import { DiffAnalyzer } from "./DiffAnalyzer.js";
import { ScoringEngine } from "./ScoringEngine.js";
import { SuggestionEngine } from "./SuggestionEngine.js";

export class ProjectContext {
    options: Record<string, unknown>;
    root: string | null;
    projectPackage: Record<string, unknown> | null;
    packageManager: string;
    config: Record<string, unknown> & Partial<ConfigOptions>;
    stagedFiles: string[];
    stagedDiff: string;
    analysis: DiffAnalysis | null;
    scoreSummary: (ScoreSummary & TransparentScore) | null;
    transparentScore: TransparentScore | null;
    suggestionSummary: SuggestionSummary | null;
    profile?: string;
    penalties?: Array<{ reason: string; impact: number; recommendation?: string }>;

    static async create(options: Record<string, unknown> = {}): Promise<ProjectContext> {
        const context = new ProjectContext(options);
        return await context.initialize();
    }

    constructor(options: Record<string, unknown> = {}) {
        this.options = options;
        this.root = null;
        this.projectPackage = null;
        this.packageManager = "npm";
        this.config = {} as Record<string, unknown> & Partial<ConfigOptions>;
        this.stagedFiles = [];
        this.stagedDiff = "";
        this.analysis = null;
        this.scoreSummary = null;
        this.transparentScore = null;
        this.suggestionSummary = null;
    }

    async initialize(): Promise<this> {
        try {
            this.root = await this.getProjectRoot();
            this.projectPackage = (this.options.projectPackage as Record<string, unknown>) || await this.readProjectPackage();
            this.packageManager = (this.options.packageManager as string) || await this.detectPackageManager();

            // Load new config system
            let fullConfig: ConfigOptions = {} as ConfigOptions;
            try {
                fullConfig = loadConfig({ root: this.root });
            } catch (e) {
                if ((e as Error).name !== 'ConfigError') throw e;
                console.error((e as Error).message);
            }

            // Merge with legacy normalized config for backward compatibility
            const legacyConfig = normalizeGitQualityConfig(((this.projectPackage as Record<string, unknown>).gitQuality || {}) as Record<string, unknown>);
            this.config = { ...fullConfig, ...legacyConfig } as Record<string, unknown> & Partial<ConfigOptions>;

            this.stagedFiles = this.resolveStagedFiles();
            this.stagedDiff = await this.resolveStagedDiff();
            this.analysis = new DiffAnalyzer().analyze(this.stagedFiles, this.stagedDiff);
            const engine = new ScoringEngine();
            this.scoreSummary = engine.score(this.analysis, this.config || {}, []) ;
            // Compatibilité ascendante (shallow copy to avoid circular ref)
            this.transparentScore = {
                globalScore: this.scoreSummary.globalScore,
                categories: this.scoreSummary.categories,
                recommendations: this.scoreSummary.recommendations,
                weights: this.scoreSummary.weights,
            };
            const aiProvider = createAiProvider(buildAiConfigFromConfig(this.config as unknown as Record<string, unknown>));
            this.suggestionSummary = await new SuggestionEngine(aiProvider).suggest(this.analysis, this.scoreSummary);
        } catch (error) {
            throw new Error(`Project initialization failed: ${(error as Error).message}`);
        }
        return this;
    }

    resolveStagedFiles(): string[] {
        if (Array.isArray(this.options.stagedFiles)) {
            return [...this.options.stagedFiles] as string[];
        }

        return [];
    }

    async resolveStagedDiff(): Promise<string> {
        if (typeof this.options.stagedDiff === "string") {
            return this.options.stagedDiff;
        }

        try {
            const { stdout } = await execa(
                "git",
                ["diff", "--cached", "--no-color", "--unified=0"],
                this.root ? { cwd: this.root } : {},
            );
            return stdout;
        } catch {
            return "";
        }
    }

    async getProjectRoot(): Promise<string> {
        if (this.options.root) {
            return resolve(this.options.root as string);
        }
        try {
            const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
            return resolve(stdout.trim());
        } catch (error) {
            throw new Error(`Could not determine project root via git: ${(error as Error).message}`);
        }
    }

    async readProjectPackage(): Promise<Record<string, unknown>> {
        try {
            const raw = await readFile(join(this.root!, "package.json"), "utf8");
            return JSON.parse(raw);
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Malformed package.json: ${(error as Error).message}`);
            }
            throw new Error(`Could not read package.json: ${(error as Error).message}`);
        }
    }

    async detectPackageManager(): Promise<string> {
        if (!this.projectPackage) {
            this.projectPackage = await this.readProjectPackage();
        }

        const pm = (this.projectPackage as Record<string, unknown>).packageManager as string | undefined;
        if (pm) {
            if (pm.includes("pnpm")) return "pnpm";
            if (pm.includes("yarn")) return "yarn";
            if (pm.includes("bun")) return "bun";
        }
        return "npm";
    }
}
