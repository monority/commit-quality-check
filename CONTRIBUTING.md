# Contributing

## Setup
```bash
git clone https://github.com/monority/commit-quality-check
cd commit-quality-check
npm install
```

## Development
- All code is ESM (`"type": "module"`)
- Tests use Node native test runner with tsx for import resolution: `node --import tsx --test ./test/*.test.js`
- Run tests: `npm test`
- Build dist: `npm run build` (runs `node build.mjs` under the hood)

## Code Conventions
- TypeScript with strict mode (`tsconfig.json`: `strict: true`)
- All public APIs are typed — prefer interfaces from `src/types.ts`
- Use `import type { ... }` for type-only imports
- Run `npm run typecheck` (`tsc --noEmit`) before pushing
- One concern per file
- Checkers extend BaseChecker or implement CheckerPlugin interface
- All new features must include tests

## Pull Request Process
1. Ensure tests pass
2. Add tests for new functionality
3. Update documentation if API changes
4. Use Conventional Commits for PR titles

## Release Process
1. Update version in package.json
2. Run `npm run typecheck` to verify types
3. Run `npm test` to verify all tests
4. Run `npm run build` to verify build
5. Create git tag
6. Publish: `npm publish`
