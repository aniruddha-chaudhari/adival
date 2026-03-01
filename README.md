# OpenCode Agent-Browser Eval Framework

This repository bundles the Bun-powered backend that drives agent-browser evaluations plus a React/Vite frontend scaffold. The workspace is now organized so evaluation assets, OpenCode docx helpers, and the new Vite app are each easy to locate.

## Workspace layout

- `src/` — Bun server entrypoint (`src/index.ts`), shared helpers, and types that power the backend eval services.
- `eval/` — evaluation tooling and outputs. It now contains `eval/run-eval.ts`, `eval/run-task-demo.ts`, `eval/eval-config.json`, the evaluation framework under `eval/src/eval/**`, and `eval/eval-results/` plus `eval/eval-results.json`. Read `eval/README.md` for all the CLI recipes.
- `apps/vite-react/` — the freshly scaffolded React + Vite app created via `bun create vite --template react`. It keeps its own `package.json`, `bun.lock`, and `src/` sources.
- `.opencode/skills/docx/refrences/` — the docx helper scripts (`create-docx.js`, `create_docx.js`, `edit-docx.py`) now live alongside the rest of the docx skill so references stay inside that folder.

## Evaluation workflow

1. Install workspace dependencies at the root: `bun install` (the eval scripts reuse the root `bun.lock`).
2. Start Chrome with `--remote-debugging-port=9222` (e.g., `node src/launch-chrome-standalone.cjs` or launch Chrome manually). Use `netstat -tlnp | grep :9222` to confirm the socket.
3. Use `bun run eval/run-eval.ts --list` / `eval/run-eval.ts EVAL_ID` to inspect and run tasks. All outputs land under `eval/eval-results/<timestamp>/`, and the latest summary is written to `eval/eval-results.json`.
4. `eval/run-task-demo.ts` now prints a pointer to the main CLI because the more involved MockAgent helpers were retired.

## React + Vite front-end

The Vite app lives in `apps/vite-react/`. After running `bun --cwd apps/vite-react install` (the initial `bun create` already handled this), the usual commands are:

```bash
bun --cwd apps/vite-react dev      # run the dev server
bun --cwd apps/vite-react build    # generate production build
```

You can hook this folder into your deployments or integrate it with the Bun backend however you prefer.

## OpenCode docx helpers

Any loose docx scripts now sit under `.opencode/skills/docx/refrences/`. Update `.opencode/skills/docx/SKILL.md` if you need to point to the new locations when the docx skill is referenced.

## Running the backend

- `bun run src/index.ts` / `bun run --hot src/index.ts` continues to launch the Bun server described in `package.json`.
- `tsconfig.json` now includes both `src/**/*` and `eval/src/**/*` so editors and tooling can resolve the moved eval helpers.
- `.gitignore` keeps `eval/eval-results/` and `eval/eval-result.json` out of version control.
