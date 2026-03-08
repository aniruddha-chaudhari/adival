---
name: qmd
description: Search and retrieve from local markdown memory using QMD. Use when asked to search memory, retrieve past notes, check what was stored, or save information to memory for future sessions.
---

# QMD - Local Memory Search

QMD runs as a persistent HTTP daemon on `localhost:8181`. Use the MCP tools directly — do NOT use bash/shell commands for qmd since `qmd` is a Windows `.cmd` file and does not work in bash.

## Use these MCP tools

| Tool | When to use |
|------|-------------|
| `qmd_search` | Fast keyword search — use first |
| `qmd_vector_search` | Semantic search — when keyword returns nothing |
| `qmd_deep_search` | Best quality — hybrid + reranking |
| `qmd_get` | Retrieve full document by filepath or `#docid` |
| `qmd_multi_get` | Retrieve multiple files by glob or list |
| `qmd_status` | Check index health and collection info |

## Searching Memory

```sh
# Fast keyword search (default — use first)
qmd search "your query" -c memory

# Semantic search (when keyword search returns nothing)
qmd vsearch "your query" -c memory

# Best quality — hybrid + reranking (slower, use for important lookups)
qmd query "your query" -c memory
```

## Reading a File

```sh
# By filepath (relative to collection root)
qmd get memory/task-attack-on-titan.md

# By docid (shown in search results as #abc123)
qmd get "#abc123"

# Read multiple files matching a pattern
qmd multi-get "memory/*.md"
```

## Writing to Memory

Write files directly using standard file tools, then index them:

```sh
# After writing any new file, always re-index
qmd update
```

### File naming conventions
```
memory/memory/setup-<tool>.md      # install/config notes
memory/memory/pitfalls-<area>.md   # bugs, gotchas, fixes
memory/memory/user-profile.md      # user preferences
memory/memory/task-<name>.md       # task outcome summaries
```

## Workflow

1. **Before a task** — search memory for relevant context:
   ```sh
   qmd search "topic" -c memory
   ```

2. **After a task** — save what was learned:
   ```sh
   # Write the file, then index it
   qmd update
   ```

3. **Check what's stored**:
   ```sh
   qmd status
   qmd ls memory
   ```

## Collections

| Name | Contains |
|------|----------|
| `memory` | Persistent notes, setup summaries, user prefs |
| `sessions` | Agent session transcripts |
| `eval` | Evaluation framework docs |
