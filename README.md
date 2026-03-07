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

## QMD Setup (local search engine for agents)

QMD is an on-device hybrid search engine used by the agents in this repo to search markdown notes, memory, and docs. It requires **Node.js >= 22** and **Bun >= 1.0**.

### 1. Install

```bash
bun install -g @tobilu/qmd
```

**Windows only** — the installed binary is a bash script that won't run on Windows/PowerShell. Create a `.cmd` shim to fix this:

```powershell
# Run once after installing
$binDir = (bun pm bin -g)
$nodeModules = Split-Path $binDir -Parent | Join-Path -ChildPath "node_modules"
$qmdJs = "$nodeModules\@tobilu\qmd\dist\qmd.js"

# Create the wrapper
Set-Content "$binDir\qmd.cmd" "@echo off`r`nnode `"$qmdJs`" %*"

# Rename the broken bash shim so the .cmd takes priority
Rename-Item "$binDir\qmd.exe" "qmd-bun.exe"
```

Then verify: `qmd --version`

### 2. Add collections

The `memory/` folder in this repo is already structured for QMD. Register the sub-folders as collections:

```bash
qmd collection add ./memory/memory   --name memory
qmd collection add ./memory/sessions --name sessions
qmd collection add ./memory/topics   --name topics
```

Add context descriptions so agents understand what each collection contains:

```bash
qmd context add qmd://memory/   "Agent memory: user profile, decisions, session summaries"
qmd context add qmd://sessions/ "Parsed agent session transcripts and conversations"
qmd context add qmd://topics/   "Topic-specific research and reference notes"
```

### 3. Index and embed

```bash
qmd update        # index all markdown files
qmd embed         # generate vector embeddings (downloads ~2GB of models on first run)
```

### 4. Verify

```bash
qmd status        # shows collections, file counts, GPU/CPU info
qmd search "memory"
```

### MCP server (for OpenCode / Claude)

Use OpenCode with a **local MCP process** for QMD. This is the tested configuration in this repo and avoids schema/tool-loading issues.

`opencode.json` should use this shape:

```json
{
  "mcp": {
	 "qmd": {
		"type": "local",
		"command": ["node", "C:\\Users\\<YourUser>\\node_modules\\@tobilu\\qmd\\dist\\qmd.js", "mcp"],
		"enabled": true,
		"timeout": 60000
	 }
  }
}
```

Why `timeout: 60000`? The first model-backed requests can take longer than 5s; a higher timeout prevents false MCP timeouts.

### Quick validation checklist

```powershell
opencode mcp list
opencode run "use qmd_search to find 'attack on titan' in memory and tell me what you find"
```

Expected:
- `opencode mcp list` shows `qmd connected`
- `qmd_search` returns results from `memory/memory/*.md`

### Known pitfalls and fixes

1. `Invalid input mcp.qmd`
	- Cause: unsupported config shape (for example `"type": "url"`)
	- Fix: use `"type": "local"` + `"command": [...]`

2. `qmd: command not found` inside OpenCode/bash
	- Cause: on Windows, `qmd` is a `.cmd` shim and may not exist in bash PATH
	- Fix: use MCP tools (`qmd_search`, `qmd_get`, `qmd_status`) via OpenCode; for shell use PowerShell

3. `MCP error -32001: Request timed out`
	- Cause: model cold start / short timeout
	- Fix: set `timeout` to `60000` in `opencode.json`

4. Search returns no result after writing a note
	- Cause: index not refreshed
	- Fix: run `qmd update`

See `qmdreadme.md` for a complete operator guide.
