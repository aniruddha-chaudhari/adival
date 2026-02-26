# OpenCode Agent-Browser Eval Framework

A configurable evaluation framework for testing OpenCode's agent-browser skill on browser automation tasks. Scores agents using keyword/regex matching + optional LLM-as-judge evaluation.

## Overview

- **Input**: JSON-configurable tasks with prompts, scorers, and models
- **Execution**: Runs OpenCode with agent-browser skill against real web pages
- **Scoring**: Keyword/regex scoring (fast, local) + LLM judge (detailed analysis with screenshots)
- **Output**: Standardized JSON results with full outputs, scores, and metadata

## Setup

### Prerequisites
- Node.js/Bun installed
- OpenCode CLI installed (`opencode` command available)
- Chrome browser with remote debugging enabled on port 9222

### Start Chrome
```bash
# Launch Chrome with CDP debugging (do this once per session)
node src/launch-chrome-standalone.cjs
# Or manually: chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile
```

Verify port 9222 is listening:
```bash
netstat -ano | findstr :9222  # Windows
netstat -tlnp | grep :9222    # Linux/Mac
```

## Configuration

Edit `eval-config.json` to define tasks:

```json
{
  "defaultModel": "google/antigravity-gemini-3.1-pro",
  "tasks": [
    {
      "id": "EVAL_001",
      "name": "Wikipedia: Python release year",
      "category": "data-extraction",
      "prompt": "Load agent-browser skill, navigate to Wikipedia Python page, extract release year and creator.",
      "timeoutSeconds": 60,
      "scorer": {
        "type": "keywords",
        "params": {"words": ["1991", "Guido", "Rossum"]}
      },
      "llmJudge": true
    }
  ]
}
```

### Scorer Types
- `"keywords"`: Matches if all words appear (case-insensitive)
- `"regex"`: Matches if pattern matches
- `"allOf"`: Average of multiple scorers
- `"anyOf"`: Max score of multiple scorers

### Models
Set `defaultModel` or per-task `model`. Examples:
- `"google/antigravity-gemini-3.1-pro"`
- `"github-copilot/claude-sonnet-4.6"`

## Usage

### List Tasks
```bash
bun run-eval.ts --list
```

### Run All Tasks
```bash
bun run-eval.ts
```

### Run Specific Task
```bash
bun run-eval.ts EVAL_001
```

### Example Output
```
============================================================
  OpenCode Agent-Browser Eval
  Run dir: eval-results/2026-02-26_19-23-06
============================================================

Running: YouTube: open a Minecraft video (EVAL_006)
  Scoring: keyword + LLM judge

[PASS]  EVAL_006  score=100/100 (kw=100 judge=100)  time=170.2s  in=63283 out=723  YouTube: open a Minecraft video
       Judge: PASS [+screenshot] — The agent successfully navigated...

Results saved to eval-results/2026-02-26_19-23-06/
  summary.json (with full outputs)
```

## Output Structure

Results saved to `eval-results/YYYY-MM-DD_HH-MM-SS/`:

```
eval-results/2026-02-26_19-23-06/
├── summary.json          # Complete results (see below)
├── eval-minecraft.png    # Screenshots (if any)
└── ...                   # Other screenshots
```

### summary.json Structure
```json
{
  "runAt": "2026-02-26T19:23:06.000Z",
  "runDir": "eval-results/2026-02-26_19-23-06",
  "results": [
    {
      "id": "EVAL_006",
      "name": "YouTube: open a Minecraft video",
      "status": "pass",           // "pass"|"partial"|"fail"|"error"|"timeout"
      "score": 100,               // 0-100 final score
      "keywordScore": 100,        // 0-100 keyword scoring
      "judgeScore": 100,          // 0-100 LLM judge score (null if no judge)
      "judge": {
        "verdict": "PASS",        // "PASS"|"PARTIAL"|"FAIL"
        "score": 100,
        "reason": "The agent successfully...",
        "usedScreenshot": true
      },
      "elapsedMs": 170200,
      "tokens": {
        "inputTokens": 63283,
        "outputTokens": 723,
        "totalTokens": 64006,
        "byModel": {
          "google/antigravity-gemini-3.1-pro": {
            "inputTokens": 63283,
            "outputTokens": 723
          }
        }
      },
      "output": "I have completed the browser automation tasks...",  // Full agent stdout
      "error": null
    }
  ]
}
```

## Scoring Logic

- **Keyword Score**: 0-100 based on scorer rules
- **Judge Score**: LLM evaluates task completion (0/50/100 for FAIL/PARTIAL/PASS)
- **Final Score**: Average of keyword + judge scores (or keyword only if no judge)
- **Status**: 
  - `pass`: score >= 80
  - `partial`: score >= 30
  - `fail`: score < 30

## Troubleshooting

- **Port 9222 not open**: Restart Chrome with debugging enabled
- **Model not found**: Check `opencode models` for available models
- **Task timeout**: Increase `timeoutSeconds` in config
- **Judge fails**: Ensure model has vision capabilities for screenshot analysis

## Adding Tasks

1. Add new task object to `eval-config.json` `tasks` array
2. Define clear, imperative prompt
3. Set appropriate scorer (test with sample outputs)
4. Enable `llmJudge` for detailed evaluation
5. Test with `bun run-eval.ts YOUR_TASK_ID`
