# Eval tooling

All evaluation assets live inside this directory so agents can discover the tooling that scores OpenCode agent-browser runs.

## Overview

- `eval/run-eval.ts` hosts the CLI that loads tasks, runs `opencode run ...`, scores the output (keywords + optional judge), and saves the results.
- `eval/run-task-demo.ts` is a small demo that exercises the evaluation framework with the (mock) verification utilities in `eval/src/eval`.
- `eval/src/eval` holds the eval framework: task definitions, runners, telemetry scoring, judge integrations, and helpers used by both CLIs.

## Setup

### 1. Install dependencies

```bash
# From the workspace root
bun install
```

### 2. Install QMD (local hybrid search)

QMD provides BM25 + vector + re-rank search over local memory files and past sessions.
Node ≥ 22 and Bun are required (both already needed for the eval framework).

```bash
bun install -g @tobilu/qmd

# Verify
qmd --version
# On Windows, if `qmd` isn't on PATH yet, run directly:
# node "%USERPROFILE%\node_modules\@tobilu\qmd\dist\qmd.js" --version
```

> **First-time model download (~2 GB):** three small models are pulled from HuggingFace
> when you run `qmd embed` for the first time (embedding, re-ranker, query-expansion).
> They are cached in `~/.cache/qmd/` and never leave your machine.

### 3. Register collections and build the index

Run the one-time setup script from the workspace root:

```bash
bun eval/scripts/qmd-setup.ts
```

This registers three QMD collections and builds the initial BM25 + vector index:

| Collection | Directory | Contents |
|---|---|---|
| `memory` | `memory/` | Agent AGENT.md, profile, topic files |
| `sessions` | `memory/sessions/` | Exported session transcripts (Markdown) |
| `eval` | `eval/` | Eval framework code, task definitions, results |

Expected output:
```
Collections: 3
Documents:   N
Vectors:     N
MCP:         not running
```

### 4. Export past Claude Code sessions (optional)

If you use Claude Code, parse JSONL session files into searchable Markdown:

```bash
bun eval/scripts/export-sessions.ts
```

Sessions are written to `memory/sessions/<session-id>.md` and immediately indexed.
Re-run this script whenever you want the index refreshed (or add it as a cron job):

```
# cron — refresh every hour
0 * * * * bun /path/to/eval/scripts/export-sessions.ts >> ~/.cache/qmd/export.log 2>&1
```

### 5. Wire QMD into Claude Code (MCP)

Add the following to your `~/.claude/settings.json` (or the equivalent VS Code MCP config):

```json
{
  "mcpServers": {
    "qmd": {
      "command": "qmd",
      "args": ["mcp"]
    }
  }
}
```

On Windows, if `qmd` is not on PATH, use the full Node path instead:

```json
{
  "mcpServers": {
    "qmd": {
      "command": "node",
      "args": ["%USERPROFILE%\\node_modules\\@tobilu\\qmd\\dist\\qmd.js", "mcp"]
    }
  }
}
```

Restart Claude Code. The agent gains these tools: `qmd_search`, `qmd_vector_search`,
`qmd_deep_search`, `qmd_get`, `qmd_status`.

### 6. Start Chrome for browser-based evaluations

```bash
node src/launch-chrome-standalone.cjs
# or: chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile
```

Confirm the port is listening:
```bash
# Linux/macOS
netstat -tlnp | grep :9222
# Windows
netstat -ano | findstr :9222
```

---

## Memory system

The `eval/src/memory/` module implements a three-layer memory stack:

| Layer | Module | Purpose |
|---|---|---|
| FS memory | `fs-memory.ts` | `AGENT.md`, profile, journal — always in context |
| QMD search | `qmd.ts` | Past sessions, notes vault — local hybrid search |
| Tools | `tools.ts` | MCP-format tool schemas dispatched to both layers |

**Searching from agent code:**

```ts
import { qmdSearch, qmdDeepSearch, buildFullContext } from "./eval/src/memory";

// Fast BM25
const hits = qmdSearch("authentication flow", { collection: "memory", n: 5 });

// Hybrid (best quality, ~2-3 s)
const hits = qmdDeepSearch("how did we handle rate limiting last week");

// Full context block ready for system-prompt injection
const ctx = buildFullContext(fs, userQuery);
```

**Re-indexing after adding files:**

```bash
bun eval/scripts/qmd-setup.ts   # re-registers and re-indexes everything
# or just:
qmd update && qmd embed
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
