# commit-quality-check

[![CI](https://github.com/monority/commit-quality-check/actions/workflows/ci.yml/badge.svg)](https://github.com/monority/commit-quality-check/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/commit-quality-check.svg)](https://www.npmjs.com/package/commit-quality-check)
[![license](https://img.shields.io/npm/l/commit-quality-check.svg)](./LICENSE)

Pre-commit and commit-msg quality checks for Git repositories. `cq` runs lint, formatting, secret scans, tests, and commit-message validation against your staged files, scores the commit, and suggests a conventional commit message. Node 20+, works with npm, pnpm, yarn, and bun.

## Install

```bash
npm install --save-dev commit-quality-check
npx cq enable
```

(`pnpm add -D commit-quality-check && pnpm exec cq enable` for pnpm. Husky is optional — the generated hooks are self-contained.)

`cq enable` writes the hooks and sets `core.hooksPath`. Every `git commit` then runs the checks and validates the message. Bypass with `git commit --no-verify` when needed.

## Commands

| Command                                                            | Alias     | Description                                                                                           |
| :----------------------------------------------------------------- | :-------- | :---------------------------------------------------------------------------------------------------- |
| `npx cq`                                                           | `m`       | Interactive menu                                                                                      |
| `npx cq enable` / `disable`                                        | `e` / `d` | Manage the hooks                                                                                      |
| `npx cq status`                                                    | `s`       | Hook state, enabled checks, score                                                                     |
| `npx cq staged`                                                    | `f`       | Fast check on staged files                                                                            |
| `npx cq check`                                                     | `c`       | Full check (build, pack, e2e)                                                                         |
| `npx cq suggest`                                                   | `u`       | Suggest a commit header from staged changes                                                           |
| `npx cq commit`                                                    | -         | Create the suggested commit (editable in a TTY)                                                       |
| `npx cq config`                                                    | `g`       | Toggle individual checkers                                                                            |
| `npx cq json-check [--full] [--reporters <list>] [--output <dir>]` | -         | CI payload: JSON on stdout, optional report files. Env: `CQ_PROFILE`, `CQ_REPORTERS`, `CQ_OUTPUT_DIR` |
| `npx cq report [--reporters <list>]`                               | -         | Generate report files (cli, json, sarif, markdown)                                                    |
| `npx cq commit-msg <file>`                                         | -         | Validate a commit message file (used by the hook)                                                     |

Also available: `toggle` (`t`), `auto-push` (`p`), `single` (`r`), `json` (`j`).

## Checks

The `fast` profile (default) runs lint and format on staged files, secret and debug-artifact scans, dependency audit, typecheck, unit tests, and commit-message checks. `full` adds build, `npm pack --dry-run`, and Playwright e2e.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) or [Gitmoji](https://gitmoji.dev/) shortcodes. Risk analysis reads the staged diff, so removing tests inside a hunk raises the risk score even when file names alone look harmless.

Quality scripts are auto-detected from `package.json` (`lint`, `typecheck`, `test`, `build`, `e2e` and variants). Missing tools are reported with the exact install command for your package manager.

## Configuration

```json
{
  "gitQuality": {
    "skip": ["Dependencies Vulnerabilities"],
    "ignore": ["dist/", "src/generated/", "*.snap"],
    "autoPush": false,
    "risk": { "failOn": "HIGH" },
    "staged": { "prettier": true, "eslint": true }
  }
}
```

`skip` disables checkers, `ignore` excludes files from staged checks, `autoPush` adds a post-commit hook that runs full checks and pushes, `risk.failOn` fails the run at a given risk level. Rules, thresholds, and scoring weights live in `commit-quality-check.yml` — see [CONFIGURATION.md](CONFIGURATION.md).

Silence a warning on one line with a `// cq-disable secret` or `// cq-disable debug` comment.

## CI

GitHub Actions:

```yaml
- uses: monority/commit-quality-check@v3
```

GitLab and Azure templates are in [templates/](./templates). On failure a `quality-report.md` is written with the results and the fix for each check.

## Troubleshooting hooks

`cq status` shows `BROKEN` when hook files exist but the setup is incomplete — usually an older hook version, a manual edit, or another tool owning the files. Run `npx cq enable` to regenerate them. CQ expects `npm|pnpm|yarn|bun exec -- cq staged` in `.husky/pre-commit` and `core.hooksPath` pointing to `.husky`.

## Optional AI suggestions

```bash
export CQ_AI_PROVIDER=openai
export CQ_AI_KEY=sk-...
cq --ai openai suggest
```

OpenAI, Anthropic, and Ollama are supported (see the table in [CONFIGURATION.md](CONFIGURATION.md) or the `ai` key of the YAML config). Without configuration this stays off.

## Uninstall

```bash
npx cq disable                          # removes the managed hooks and unsets core.hooksPath
npx cq auto-push                        # only if auto-push was ON (toggles it off and removes the hook)
npm uninstall commit-quality-check
```

For a fully clean state, also remove what CQ may have left behind:

- the `gitQuality` key in your `package.json` (checker skip list, `autoPush` state)
- a `commit-quality-check.yml` at the project root, plus generated reports (`quality-report.md`, `report.sarif`, `report.json`)
- the `.husky/` directory — only if you did not use it for your own hooks; otherwise delete just the `pre-commit`, `commit-msg`, and `post-commit` files CQ created and keep your own

If you keep Husky for other hooks, keep your hook files and only remove the `cq` command lines inside them.

## License

[MIT](./LICENSE)
