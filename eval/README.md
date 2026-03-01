# Eval tooling

All evaluation assets live inside this directory so agents can discover the tooling that scores OpenCode agent-browser runs.

## Overview

- `eval/run-eval.ts` hosts the CLI that loads tasks, runs `opencode run ...`, scores the output (keywords + optional judge), and saves the results.
- `eval/run-task-demo.ts` is a small demo that exercises the evaluation framework with the (mock) verification utilities in `eval/src/eval`.
- `eval/src/eval` holds the eval framework: task definitions, runners, telemetry scoring, judge integrations, and helpers used by both CLIs.

## Setup

1. Install dependencies via Bun at the workspace root (`bun install`).
2. Start Chrome with remote debugging enabled on port 9222 before running tasks.
   ```bash
   node src/launch-chrome-standalone.cjs
   # or: chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile
   ```
3. Confirm the port is listening:
   ```bash
   netstat -tlnp | grep :9222
   ```

## Running evaluations

- `bun run eval/run-eval.ts --list` lists available eval tasks.
- `bun run eval/run-eval.ts` runs every task defined in `eval/eval-config.json`.
- `bun run eval/run-eval.ts EVAL_ID` runs a single task by ID.
- `bun run eval/run-task-demo.ts` demonstrates how to use the eval framework with the demo task.

Use `eval/eval-config.json` to add or edit tasks, scorers, and judge settings for new evaluations.

## Output

- Each run writes to `eval/eval-results/<YYYY-MM-DD_HH-MM-SS>/` (summary, raw output, screenshots).
- The latest aggregated summary is stored at `eval/eval-results.json` for convenience.

## Notes

- `eval/src/eval` exports everything an agent needs: tasks, runners, scoring, telemetry, and helper scripts.
- Keep `eval/eval-results/` and `eval/eval-result.json` out of version control (they are ignored in `.gitignore`).
