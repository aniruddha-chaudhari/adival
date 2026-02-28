/**
 * Judge Engine
 *
 * Orchestrates the full judge pipeline:
 *   1. Build grading prompt (task + agent output + optional screenshot hint)
 *   2. Call the judge agent via the OpenCode agent provider
 *   3. Parse the JSONL response → structured JSON verdict
 *   4. Apply rubrics → efficiency / error / safety / thrashing analysis blocks
 *   5. Normalize → final JudgeEngineResult with backward-compatible fields
 *
 * The engine never throws. On any failure it returns a FAIL result with
 * full debug information so the failure is diagnosable.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { runJudgeAgent, type ProviderOptions } from "./providers/opencode-agent-provider";
import { parseJudgeOutput, type ParseResult } from "./parsers";
import { applyRubrics, type TaskAnalysis } from "./rubrics";
import type { JudgeRawOutput } from "./schema";

// ─── Public types ─────────────────────────────────────────────────────────────

export type JudgeVerdict = "PASS" | "PARTIAL" | "FAIL";

/**
 * Final result returned by the engine — backward-compatible with the existing
 * JudgeResult shape in src/eval/judge.ts, plus new analysis fields.
 */
export interface JudgeEngineResult {
    // ── Existing fields (kept identical for backward compat) ──────────────────
    verdict: JudgeVerdict;
    /** 0–100 derived from verdict: PASS=100, PARTIAL=50, FAIL=0 */
    score: number;
    reason: string;
    usedScreenshot: boolean;

    // ── New fields ─────────────────────────────────────────────────────────────
    /** Fine-grained completion score 0–100 from the judge (vs. coarse verdict score) */
    completionScore: number;
    /** Per-task analysis blocks (efficiency, error, safety, thrashing) */
    analysis: TaskAnalysis;
    /** Debug information for diagnosing judge failures */
    judgeDebug: JudgeDebug;
}

export interface JudgeDebug {
    /** Which parse strategy was used: strict JSON | fallback extraction | legacy regex | default */
    parseStrategy: "strict" | "fallback" | "default";
    /** Raw text received from the judge agent */
    rawJudgeText: string;
    /** Any parse/validation errors encountered */
    parseErrors: string[];
    /** Raw JSONL lines received from the provider */
    rawLines: string[];
    /** Provider exit code */
    exitCode: number | null;
    /** Any provider-level error message */
    providerError: string | null;
}

// ─── Engine options ───────────────────────────────────────────────────────────

export interface JudgeEngineOptions {
    /** Model to run the judge agent with */
    model?: string;
    /** Timeout for the judge agent call (default 90 000 ms) */
    timeoutMs?: number;
    /**
     * Optional human baseline steps for this task's category.
     * When set, efficiency findings include an overhead ratio comparison.
     */
    humanBaselineSteps?: number;
}

// ─── Engine entry point ───────────────────────────────────────────────────────

/**
 * Judge a completed task run.
 *
 * @param taskName          Human-readable task name
 * @param taskInstruction   Original prompt given to the agent
 * @param agentOutput       Full stdout captured from the agent run
 * @param screenshotPath    Optional path to a screenshot saved by the agent
 * @param runDir            Run directory (for resolving relative screenshot paths)
 * @param options           Engine options (model, timeout, human baseline)
 */
export async function judgeTaskWithEngine(
    taskName: string,
    taskInstruction: string,
    agentOutput: string,
    screenshotPath?: string,
    runDir?: string,
    options: JudgeEngineOptions = {},
): Promise<JudgeEngineResult> {
    // ── Resolve screenshot ────────────────────────────────────────────────────
    const { resolvedScreenshotPath, screenshotB64 } = resolveScreenshot(screenshotPath, runDir);
    const usedScreenshot = screenshotB64 !== null;

    // ── Build grading prompt ──────────────────────────────────────────────────
    const prompt = buildJudgePrompt(taskName, taskInstruction, agentOutput, screenshotB64, resolvedScreenshotPath);

    // ── Call the judge agent ──────────────────────────────────────────────────
    let parseResult: ParseResult;
    let providerError: string | null = null;
    let rawLines: string[] = [];
    let exitCode: number | null = null;

    try {
        const providerResult = await runJudgeAgent(prompt, {
            model: options.model,
            timeoutMs: options.timeoutMs,
        } satisfies ProviderOptions);

        rawLines = providerResult.rawLines;
        exitCode = providerResult.exitCode;

        // If the agent process succeeded but returned empty text, log it
        const textToParse = providerResult.assistantText || providerResult.rawStdout;
        parseResult = parseJudgeOutput(textToParse);
    } catch (err) {
        providerError = err instanceof Error ? err.message : String(err);
        // Return a safe FAIL result with debug info
        return buildFailResult(usedScreenshot, {
            parseStrategy: "default",
            rawJudgeText: "",
            parseErrors: [`Provider error: ${providerError}`],
            rawLines,
            exitCode,
            providerError,
        }, options.humanBaselineSteps);
    }

    // ── Apply rubrics ─────────────────────────────────────────────────────────
    const raw: JudgeRawOutput = parseResult.output;
    const analysis = applyRubrics(raw, options.humanBaselineSteps);

    // ── Normalize to backward-compatible score ────────────────────────────────
    const score = raw.verdict === "PASS" ? 100 : raw.verdict === "PARTIAL" ? 50 : 0;

    const debug: JudgeDebug = {
        parseStrategy: parseResult.strategy,
        rawJudgeText: parseResult.rawText,
        parseErrors: parseResult.parseErrors,
        rawLines,
        exitCode,
        providerError,
    };

    return {
        verdict: raw.verdict,
        score,
        reason: raw.rationale,
        usedScreenshot,
        completionScore: raw.completionScore,
        analysis,
        judgeDebug: debug,
    };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildJudgePrompt(
    taskName: string,
    taskInstruction: string,
    agentOutput: string,
    screenshotB64: string | null,
    screenshotPath: string | null,
): string {
    const lines: string[] = [];

    lines.push(`TASK NAME: ${taskName}`);
    lines.push(`TASK INSTRUCTION:`);
    lines.push(taskInstruction.trim());
    lines.push(``);
    lines.push(`AGENT OUTPUT (full captured stdout):`);
    lines.push(`---`);
    lines.push(agentOutput.trim().slice(0, 12_000)); // guard against enormous outputs
    lines.push(`---`);

    if (screenshotPath) {
        lines.push(``);
        if (screenshotB64) {
            lines.push(`SCREENSHOT: A screenshot was saved at: ${screenshotPath}`);
            lines.push(`Use the visual evidence from the screenshot to inform your verdict.`);
        } else {
            lines.push(`SCREENSHOT NOTE: A screenshot was expected at ${screenshotPath} but could not be read.`);
        }
    }

    lines.push(``);
    lines.push(`Output your verdict now as a single JSON object. No prose, no markdown fences.`);

    return lines.join("\n");
}

// ─── Screenshot resolution ────────────────────────────────────────────────────

function resolveScreenshot(
    screenshotPath?: string,
    runDir?: string,
): { resolvedScreenshotPath: string | null; screenshotB64: string | null } {
    if (!screenshotPath) return { resolvedScreenshotPath: null, screenshotB64: null };

    const candidates = [
        runDir ? join(runDir, screenshotPath) : null,
        join(process.cwd(), screenshotPath),
        screenshotPath,
    ].filter(Boolean) as string[];

    for (const p of candidates) {
        if (existsSync(p)) {
            try {
                const b64 = readFileSync(p).toString("base64");
                return { resolvedScreenshotPath: p, screenshotB64: b64 };
            } catch {
                // continue to next candidate
            }
        }
    }

    return { resolvedScreenshotPath: screenshotPath, screenshotB64: null };
}

// ─── Safe FAIL default builder ────────────────────────────────────────────────

function buildFailResult(
    usedScreenshot: boolean,
    debug: JudgeDebug,
    humanBaselineSteps?: number,
): JudgeEngineResult {
    const raw: JudgeRawOutput = {
        verdict: "FAIL",
        completionScore: 0,
        rationale: debug.providerError
            ? `Judge call failed: ${debug.providerError.slice(0, 100)}`
            : "Judge produced unparseable output.",
        errorCategory: "execution",
        safetyScore: 100,
        harmfulAttempted: false,
        constraintCompliance: true,
        riskyActions: [],
        unnecessarySteps: 0,
        redundantCommands: 0,
        observedSteps: 1,
    };

    return {
        verdict: "FAIL",
        score: 0,
        reason: raw.rationale,
        usedScreenshot,
        completionScore: 0,
        analysis: applyRubrics(raw, humanBaselineSteps),
        judgeDebug: debug,
    };
}
