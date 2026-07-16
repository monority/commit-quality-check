import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckerPlugin } from '../types.js';
import { BaseChecker } from "./BaseChecker.js";

export class CheckRegistry {
    checkers: Map<string, BaseChecker>;
    plugins: Map<string, CheckerPlugin>;

    constructor() {
        this.checkers = new Map();
        this.plugins = new Map();
    }

    register(checker: BaseChecker): this {
        this.checkers.set(checker.name, checker);
        return this;
    }

    registerMany(checkers: BaseChecker[] = []): this {
        for (const checker of checkers) {
            this.register(checker);
        }

        return this;
    }

    registerPlugin(plugin: CheckerPlugin): this {
        if (!plugin || typeof plugin !== "object") {
            throw new TypeError("Plugin must be an object.");
        }

        const checkersFn = plugin.checkers as (() => unknown[]) | unknown[] | undefined;
        const checkersRaw = typeof checkersFn === "function"
            ? checkersFn()
            : (checkersFn || []);

        const checkers = checkersRaw as unknown[];

        if (!Array.isArray(checkers)) {
            throw new TypeError("Plugin checkers must be an array or function returning an array.");
        }

        const pluginName = plugin.name || `plugin-${this.plugins.size + 1}`;
        this.plugins.set(pluginName, plugin);
        return this.registerMany(checkers as BaseChecker[]);
    }

    async discover(checkersDir: string): Promise<this> {
        const files = await readdir(checkersDir);

        for (const file of files) {
            if ((file.endsWith(".js") || file.endsWith(".ts")) && file !== "index.js" && file !== "index.ts") {
                const filePath = join(checkersDir, file);
                const fileUrl = pathToFileURL(filePath).href;

                try {
                    const module = await import(fileUrl);
                    for (const exportKey in module) {
                        const ExportedClass = module[exportKey];
                        if (
                            typeof ExportedClass === "function" &&
                            ExportedClass !== BaseChecker &&
                            ExportedClass.prototype instanceof BaseChecker
                        ) {
                            const instance = new ExportedClass();
                            this.register(instance);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Failed to load checker from ${file}: ${(error as Error).message}`);
                }
            }
        }
        return this;
    }

    getCheckersForProfile(profile: string = "fast", skipList: string[] = [], onlyNames: string[] = []): BaseChecker[] {
        const activeCheckers: BaseChecker[] = [];
        const onlySet = new Set(onlyNames);

        for (const checker of this.checkers.values()) {
            if (onlySet.size > 0 && !onlySet.has(checker.name)) continue;
            if (onlySet.size === 0 && skipList.includes(checker.name)) continue;

            if (profile === "full") {
                activeCheckers.push(checker);
            } else if (checker.profile === "fast" || !checker.profile) {
                activeCheckers.push(checker);
            }
        }

        return activeCheckers;
    }

    get allCheckers(): BaseChecker[] {
        return Array.from(this.checkers.values());
    }

    get allPlugins(): CheckerPlugin[] {
        return Array.from(this.plugins.values());
    }

    getCheckerById(id: string): BaseChecker | undefined {
        for (const checker of this.checkers.values()) {
            if (checker.id === id) return checker;
        }
        return undefined;
    }

    getCheckersByCategory(category: 'message' | 'history' | 'workflow' | 'security' | 'quality'): BaseChecker[] {
        return this.allCheckers.filter((c) => c.category === category);
    }

    async discoverExternal(pluginDir: string): Promise<unknown[]> {
        console.log(`[CheckRegistry] External plugin discovery from "${pluginDir}" — not yet implemented`);
        return [];
    }
}
