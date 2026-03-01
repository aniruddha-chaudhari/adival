/**
 * LLM-as-Judge — Public API
 *
 * This module is the single import point for runner.ts. It re-exports the
 * backward-compatible JudgeResult/JudgeVerdict types and the judgeTask()
 * function, now backed by the new judge engine pipeline instead of the
 * old fragile regex-based subprocess.
 *
 * Bug fix summary (was always returning judgeScore=0):
 *   OLD: private runOpencode() spawned opencode without --format json or --quiet,
 *        captured raw TTY output (ANSI + spinner frames), then tried to match
 *        /VERDICT:\s*(PASS|PARTIAL|FAIL)/ — which never matched.
 *   NEW: uses --agent judge --format json to get a clean JSONL event stream,
 *        extracts assistant text blocks, parses structured JSON, falls back
 *        gracefully if the model wraps text in prose.
 */

import { judgeTaskWithEngine, type JudgeEngineResult } from "./judge/engine";
import type { TaskAnalysis } from "./judge/rubrics";
import type { JudgeDebug } from "./judge/engine";

// ─── Backward-compatible public types ────────────────────────────────────────

export type JudgeVerdict = "PASS" | "PARTIAL" | "FAIL";

/**
 * JudgeResult — kept identical to the original shape so runner.ts needs no changes.
 * New optional fields are added at the bottom.
 */
export interface JudgeResult {
    verdict: JudgeVerdict;
    /** 0–100: PASS=100, PARTIAL=50, FAIL=0 (backward-compat coarse score) */
    score: number;
    reason: string;
    usedScreenshot: boolean;

    // ── New fields (Phase 2) ───────────────────────────────────────────────────
    /** Fine-grained completion score 0–100 (judge self-reported) */
    completionScore?: number;
    /** Per-task analysis blocks: efficiency, error, safety, thrashing */
    analysis?: TaskAnalysis;
    /** Debug payload for diagnosing judge failures */
    judgeDebug?: JudgeDebug;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface JudgeOptions {
    /** Model to use for the judge agent (omit to use opencode default) */
    model?: string;
    /** Timeout in milliseconds for the judge call (default 90 000) */
    timeoutMs?: number;
    /** Human baseline steps for this task, used in efficiency comparison */
    humanBaselineSteps?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Judge a completed task using the dedicated judge subagent.
 *
 * @param taskName          Human-readable task name
 * @param taskInstruction   Original prompt given to the agent
 * @param agentOutput       Full stdout captured from the agent run
 * @param screenshotPath    Optional path to a screenshot saved by the agent
 * @param runDir            Run directory (for resolving relative screenshot paths)
 * @param options           Judge options (model, timeout, human baseline)
 */
export async function judgeTask(
    taskName: string,
    taskInstruction: string,
    agentOutput: string,
    screenshotPath?: string,
    runDir?: string,
    options: JudgeOptions = {},
): Promise<JudgeResult> {
    const engineResult: JudgeEngineResult = await judgeTaskWithEngine(
        taskName,
        taskInstruction,
        agentOutput,
        screenshotPath,
        runDir,
        {
            model: options.model,
            timeoutMs: options.timeoutMs,
            humanBaselineSteps: options.humanBaselineSteps,
        },
    );

    return {
        verdict: engineResult.verdict,
        score: engineResult.score,
        reason: engineResult.reason,
        usedScreenshot: engineResult.usedScreenshot,
        completionScore: engineResult.completionScore,
        analysis: engineResult.analysis,
        judgeDebug: engineResult.judgeDebug,
    };
}
