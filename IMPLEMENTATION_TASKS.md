yes right so create a md file in root of the folder listing all task to be done by the agent and useful context for it one by one
tasks:
JUDGE

1. we can use the runJudgeAgent rawStdout as its already proper json as given in its args
2. make sure extractAssistantText gives all necessary things to the judge for evaluation see renderChatMarkdown from .opencode\plugins\session-auto-export.ts for refrence md rendering
3. save the stdout as a json file, the grnerated text for judge to read, judge output to a folder with the eval id and name as its name so only that eval can override itself such as modelName/evalFolders...
4. i want to run the judge two times and save its both output in folder, use second result for the analysis if first errors out, if judge errors out log the error in its output and both times error then log that task to error inside the modelName/errors
   TIME AND INTELLIGENCE
   need to improve it in following ways as discussed
   improve it :

- Use success-conditioned speed too: average time on passed tasks only.
- Add median + IQR (not only mean) to reduce outlier impact.
  STEP COUNTING
  thrash ratio should be calculated based on judge output (observedSteps= trajectoryLength) not telementary
  telementary derived observedCommands should be removed and converted to no of toolcalls

---

# Eval System Implementation Tasks

This file captures the next implementation tasks and key context for the agent.

## Scope

- Focus areas: Judge pipeline, Time/Intelligence metrics, Step counting.
- Keep changes backward-compatible where possible.
- Prefer deterministic calculations over heuristic parsing.

## 1) JUDGE

### 1.1 Use raw stdout from `runJudgeAgent`

- `runJudgeAgent` currently returns `rawStdout`, `rawLines`, and extracted assistant text.
- Use `rawStdout` as the canonical source to persist judge run artifacts (because provider is invoked with `--format json`).
- Ensure parse/debug metadata still records strategy/errors.

### 1.2 Improve what judge receives for evaluation

- Ensure content passed into judge includes all necessary context but is clean and concise.
- Review `extractAssistantText` behavior and include enough content for grading quality.
- Use `.opencode/plugins/session-auto-export.ts` `renderChatMarkdown` as reference for clean markdown-style rendering.
- Goal: avoid noisy/raw event junk while preserving task-relevant evidence.

### 1.3 Persist judge artifacts per eval/task

- Save these artifacts for each task run:
  - Raw stdout JSON (provider output stream)
  - Rendered text/context sent to judge
  - Judge parsed output JSON
- Folder structure should isolate by model and eval identity so reruns overwrite only the same eval/task:
  - Example shape: `eval/eval-results/<modelName>/<evalId_or_taskName>/...`
- Filename strategy should be deterministic and collision-safe.

### 1.4 Run judge up to two times with fallback behavior

- Always run judge twice (`attempt_1`, `attempt_2`) and persist both.
- Primary selection rules:
  - Use `attempt_1` for analysis if it is valid.
  - If `attempt_1` is invalid (provider timeout/error, unparseable output, missing required fields), use `attempt_2` if valid.
  - If both are invalid, mark task as judge-error.
- Persist outputs/errors from both attempts.
- If both attempts fail, record task-level error in:
  - `eval/eval-results/<modelName>/errors/<evalId_or_taskName>.json`
- Error logs must include reason (timeout, parse failure, provider error, etc.).
- If both attempts are valid but key numeric fields differ, record mismatch for manual review and continue with `attempt_1` values.
- Key numeric fields to compare for mismatch: `completionScore`, `safetyScore`, `observedSteps`, `unnecessarySteps`, `redundantCommands`.

## 2) TIME AND INTELLIGENCE METRICS

Improve comparison metrics:

- Add success-conditioned speed:
  - Average elapsed time for passed tasks only.
- Add robust distribution stats:
  - Median
  - IQR (Q3 - Q1)
- Keep existing mean values for compatibility, but highlight median/IQR in analysis and visualization.

## 3) STEP COUNTING

### 3.1 Thrash ratio source of truth

- Thrash ratio should be derived from judge output (not telemetry).
- Use judge `observedSteps` as `trajectoryLength`.
- Compute thrash from judge fields in analysis/aggregation path.

### 3.2 Telemetry command counting change

- Remove telemetry-derived `observedCommands` as step-count source.
- Replace with deterministic "number of tool calls" metric.
- Telemetry should not infer semantic steps from regex matches.
- Tool-call count must be computed from structured JSON events only (provider output), not from free-form text lines.

## Suggested implementation touchpoints

- Judge provider/parsing:
  - `eval/src/eval/judge/providers/opencode-agent-provider.ts`
  - `eval/src/eval/judge/parsers.ts`
  - `eval/src/eval/judge/engine.ts`
- Rubrics + aggregation:
  - `eval/src/eval/judge/rubrics.ts`
  - `eval/src/eval/aggregates.ts`
- Telemetry:
  - `eval/src/eval/telemetry.ts`
- Result persistence:
  - `eval/run-eval.ts`
- Visualization updates:
  - `eval/visualization/generate_visualizations.py`
  - `eval/visualization/visualizers/time_metrics.py`
  - (and related visualizers using mean-only fields)

## Acceptance criteria (high-level)

- Judge attempts are persisted and reproducible per task.
- Judge fallback behavior (attempt #2) works and is logged.
- Failed-both-attempts tasks are recorded in model-specific errors folder.
- Time metrics include mean + success-conditioned mean + median + IQR.
- Thrash ratio no longer prefers telemetry heuristic parsing.
- Step count reporting is based on judge (`observedSteps -> trajectoryLength`).
- Tool-call count exists as a separate metric and is computed from structured JSON events, not regex line matching.

## Output schema changes (minimal)

- Keep existing fields for backward compatibility.
- Add per-task fields:
  - `judgeAttempts`: array of two entries (`attempt_1`, `attempt_2`) with raw output, parsed output, and error metadata.
  - `judgeSelectedAttempt`: `"attempt_1" | "attempt_2" | null`.
  - `judgeMismatch`: `{ detected: boolean, fields: string[] }`.
  - `toolCallCount`: number (counted from structured JSON events).
- Keep `analysis.efficiency.trajectoryLength` as judge `observedSteps`.
- Keep `analysis.thrashing.thrashRatio`, but compute from judge-derived values in aggregation preference.
- Add run-level time metrics:
  - `meanElapsedMs`
  - `meanElapsedMsPassed`
  - `medianElapsedMs`
  - `iqrElapsedMs`

---

Implementation Complete
Here's a summary of everything that was implemented:
Files Modified (11)
File Changes
eval/src/eval/judge/schema.ts Added JudgeAttemptResult, JudgeMismatch, MISMATCH_FIELDS
eval/src/eval/judge/engine.ts Rewritten: two-attempt pipeline, rendered markdown input, mismatch detection
eval/src/eval/judge.ts Threaded new fields (judgeAttempts, judgeSelectedAttempt, judgeMismatch, renderedContext)
eval/src/eval/runner.ts Added toolCallCount, judgeAttempts, judgeSelectedAttempt, judgeMismatch, renderedContext fields
eval/src/eval/telemetry.ts Added countToolCalls() — deterministic JSONL event counting
eval/src/eval/aggregates.ts Added TimeAggregates (median/IQR/success-conditioned mean), rewrote thrashing to use judge-only
eval/run-eval.ts Rewritten: model-based folder structure, per-task artifacts, removed output/judgeDebug from summary
eval/visualization/visualizers/time_metrics.py Added success-conditioned mean markers, IQR annotations
eval/visualization/generate_visualizations.py Added toolCallCount aggregation
Files Created (1)
File Purpose
eval/src/eval/judge/render.ts JSONL-to-markdown renderer for judge input
Acceptance Criteria Met

- Judge attempts are persisted and reproducible per task (separate files per attempt)
- Judge fallback behavior (attempt #2) works and is logged
- Failed-both-attempts tasks recorded in <model>/errors/<taskId>.json
- Time metrics include mean + success-conditioned mean + median + IQR
- Thrash ratio no longer prefers telemetry heuristic parsing
- Step count reporting uses judge observedSteps as trajectoryLength
- Tool-call count exists as separate metric from structured JSONL events
- output removed from summary.json (now in per-task agent-output.jsonl)
