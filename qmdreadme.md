# QMD README (Project-Specific)

This guide documents the **working** QMD setup for this repository, including Windows fixes and OpenCode integration.

## What QMD is used for here

- Persisting agent memory in markdown files under `memory/`
- Searching that memory from OpenCode with `qmd_search`, `qmd_get`, and related tools
- Avoiding repeated mistakes by storing setup notes and pitfalls

## Memory folders in this repo

- `memory/memory/` - persistent memory notes
- `memory/sessions/` - session transcripts / short-lived context
- `memory/topics/` - topic-specific notes

## 1. Install QMD

```powershell
bun install -g @tobilu/qmd
```

## 2. Windows launcher fix (required)

QMD installs a bash-style launcher. On Windows, create a CMD shim:

```powershell
$binDir = (bun pm bin -g)
$nodeModules = Join-Path (Split-Path $binDir -Parent) "node_modules"
$qmdJs = Join-Path $nodeModules "@tobilu\qmd\dist\qmd.js"

Set-Content "$binDir\qmd.cmd" "@echo off`r`nnode `"$qmdJs`" %*"
Rename-Item "$binDir\qmd.exe" "qmd-bun.exe" -ErrorAction SilentlyContinue
```

Verify:

```powershell
qmd --version
```

## 3. Create collections (one-time)

Run from repository root:

```powershell
qmd collection add ./memory/memory --name memory
qmd collection add ./memory/sessions --name sessions
qmd collection add ./memory/topics --name topics
```

Optional context labels:

```powershell
qmd context add qmd://memory/ "Agent memory: profile, decisions, summaries"
qmd context add qmd://sessions/ "Session transcripts and temporary notes"
qmd context add qmd://topics/ "Topic-specific reference notes"
```

## 4. Index content

```powershell
qmd update
```

If you add new files later, run `qmd update` again.

## 5. OpenCode MCP configuration (tested)

Use **local MCP** in `opencode.json`:

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

Why this shape:

- `type: local` is accepted and stable in this project
- `timeout: 60000` avoids model cold-start timeout failures

## 6. Verify end-to-end

```powershell
opencode mcp list
opencode run "use qmd_search to find 'attack on titan' in memory and tell me what you find"
```

Expected:

- `qmd connected` in MCP list
- search returns entries from `memory/memory/`

## 7. Daily workflow

### Save memory

```powershell
opencode run "summarize this task and write it to memory/memory/task-my-task.md, then run qmd update"
```

### Search memory

```powershell
opencode run "find my notes about <topic> in memory"
```

### Read a specific note

```powershell
qmd get "memory/memory/task-my-task.md"
```

## Troubleshooting

1. `Invalid input mcp.qmd`

- Cause: wrong config schema for `mcp.qmd`
- Fix: use `type: local` + `command` array

2. `qmd: command not found` (inside bash)

- Cause: Windows shim is `.cmd`
- Fix: use PowerShell for CLI; use MCP tools from OpenCode

3. `MCP error -32001: Request timed out`

- Cause: short timeout during first model load
- Fix: set `timeout: 60000` in `opencode.json`

4. Search returns no results after writing file

- Cause: index not refreshed
- Fix: run `qmd update`

5. `qmd update` appears to succeed but returns non-zero in some terminals

- Cause: mixed stdout/stderr handling in shell wrappers
- Fix: trust the summary lines (`All collections updated`) and verify with `qmd status` or `qmd search`
