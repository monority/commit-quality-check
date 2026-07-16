import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

// 1. Clean
rmSync(dist, { recursive: true, force: true });

// 2. Compile TypeScript â†’ JS
console.log('Building TypeScript...');
execSync('npx tsc --project tsconfig.json --outDir dist', { stdio: 'inherit', cwd: root });

// 3. Copy non-TS assets
for (const entry of ['README.md', 'LICENSE', 'cq']) {
    const source = join(root, entry);
    if (existsSync(source)) {
        cpSync(source, join(dist, entry), { recursive: true });
    }
}

// 4. Generate dist/package.json
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const distPackage = {
    name: rootPackage.name,
    version: rootPackage.version,
    description: rootPackage.description,
    type: rootPackage.type,
    main: 'scripts/cli.js',
    bin: {
        'commit-quality-check': 'scripts/cli.js',
        cq: 'scripts/cli.js',
    },
    files: ['scripts', 'src', 'README.md', 'LICENSE', 'cq'],
    scripts: rootPackage.scripts?.prepare ? { prepare: rootPackage.scripts.prepare } : {},
    publishConfig: rootPackage.publishConfig,
    keywords: rootPackage.keywords,
    author: rootPackage.author,
    license: rootPackage.license,
    dependencies: Object.fromEntries(
        Object.entries(rootPackage.dependencies || {}).filter(([name]) => name !== rootPackage.name),
    ),
    engines: rootPackage.engines,
};
writeFileSync(join(dist, 'package.json'), `${JSON.stringify(distPackage, null, 2)}\n`);
console.log('Build complete.');

