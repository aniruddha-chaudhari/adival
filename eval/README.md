# Eval

Runs OpenCode agent-browser tasks, scores them (keyword + LLM judge), and saves structured results.

## Setup

1. `bun install` at workspace root

## Config files

| File               | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `eval-config.json` | Task definitions for a domain (add `name`, `tasks`, scorers) |
| `models.json`      | List of models to run evaluations against                    |

Each eval config must have a top-level `"name"` field (e.g. `"web-browsing"`). This becomes the output folder name under the model directory.

## Running

```bash
# Run all tasks (default config + models.json)
bun run run-eval.ts

# Run a specific config file
bun run run-eval.ts --config eval-config-coding.json

# Use a different models file
bun run run-eval.ts --config eval-config-coding.json --models models-pro.json

# Run a single task by ID (against all models in models.json)
bun run run-eval.ts --task EVAL_001 --config eval-config-coding.json --models models-pro.json

# Run a subset of tasks in one command (comma-separated IDs)
bun run run-eval.ts --tasks EVAL_001,EVAL_006,EVAL_010 --config eval-config-coding.json --models models-pro.json

# List available tasks
bun run run-eval.ts --list
```

## Output structure

```
eval-results/
  <model>/
    <domain>/              ← wiped and recreated on each run of that config+model
      summary.json         ← scores, tokens, analysis for the whole run
      <TASK_ID>_<slug>/
        agent-output.jsonl
        judge/
          context-sent.md
          attempt_1/       ← raw-stdout.jsonl, assistant-text.txt, parsed-output.json
          attempt_2/
        screenshots/
      errors/              ← tasks where both judge attempts failed
        <TASK_ID>.json
```

Re-running one config+model pair only wipes that `<domain>/` folder — other domains and models are untouched.

## Adding a new domain

1. Copy `eval-config.json` → `eval-config-<domain>.json`
2. Set `"name": "<domain>"` at the top
3. Add your tasks with prompts and scorers
4. Run with `--config eval-config-<domain>.json`
