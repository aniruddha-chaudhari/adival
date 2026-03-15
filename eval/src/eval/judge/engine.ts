/**
 * Judge Engine
 *
 * Orchestrates the full judge pipeline:
 *   1. Render agent output to clean markdown
 *   2. Build grading prompt (task + rendered output + optional screenshot hint)
 *   3. Call the judge agent TWICE for consistency validation
 *   4. Select the best valid attempt, detect mismatches
 *   5. Parse the JSONL response → structured JSON verdict
 *   6. Apply rubrics → efficiency / error / safety / thrashing analysis blocks
 *   7. Normalize → final JudgeEngineResult with backward-compatible fields
 *
 * The engine never throws. On any failure it returns a FAIL result with
 * full debug information so the failure is diagnosable.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { runJudgeAgent, type ProviderOptions } from "./providers/opencode-agent-provider";
import { parseJudgeOutput, type ParseResult } from "./parsers";
import { applyRubrics, type TaskAnalysis } from "./rubrics";
import { renderAgentOutput } from "./render";
import {
  type JudgeRawOutput,
  type JudgeAttemptResult,
  type JudgeMismatch,
  MISMATCH_FIELDS,
} from "./schema";

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

  // ── Two-attempt fields ─────────────────────────────────────────────────────
  /** Both judge attempts with full artifacts */
  judgeAttempts: JudgeAttemptResult[];
  /** Which attempt was selected for scoring */
  judgeSelectedAttempt: "attempt_1" | "attempt_2" | null;
  /** Mismatch info between the two attempts */
  judgeMismatch: JudgeMismatch;
  /** Rendered markdown sent to the judge */
  renderedContext: string;
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
  /** Files the agent was expected to produce — passed as paths to the judge */
  outputFiles?: string[];
  /** Path to a pre-authored reference answer file — passed as a path to the judge */
  expectedOutputFile?: string;
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
  options: JudgeEngineOptions = {}
): Promise<JudgeEngineResult> {
  // ── Resolve screenshot ────────────────────────────────────────────────────
  const { resolvedScreenshotPath, screenshotB64 } = resolveScreenshot(screenshotPath, runDir);
  const usedScreenshot = screenshotB64 !== null;

  // ── Render agent output to clean markdown ─────────────────────────────────
  const renderedContext = renderAgentOutput(agentOutput);

  // ── Build grading prompt ──────────────────────────────────────────────────
  const prompt = buildJudgePrompt(
    taskName,
    taskInstruction,
    renderedContext,
    screenshotB64,
    resolvedScreenshotPath,
    options.outputFiles,
    options.expectedOutputFile
  );

  // ── Run judge agent twice ─────────────────────────────────────────────────
  const providerOpts: ProviderOptions = {
    model: options.model,
    timeoutMs: options.timeoutMs,
  };

  const attempt1 = await runSingleAttempt(prompt, providerOpts);
  const attempt2 = await runSingleAttempt(prompt, providerOpts);
  const judgeAttempts: JudgeAttemptResult[] = [attempt1, attempt2];

  // ── Select best valid attempt ─────────────────────────────────────────────
  const attempt1Valid = isAttemptValid(attempt1);
  const attempt2Valid = isAttemptValid(attempt2);

  let selectedAttempt: JudgeAttemptResult | null = null;
  let judgeSelectedAttempt: "attempt_1" | "attempt_2" | null = null;

  if (attempt1Valid) {
    selectedAttempt = attempt1;
    judgeSelectedAttempt = "attempt_1";
  } else if (attempt2Valid) {
    selectedAttempt = attempt2;
    judgeSelectedAttempt = "attempt_2";
  }

  // ── Mismatch detection ────────────────────────────────────────────────────
  const judgeMismatch = detectMismatch(attempt1, attempt2, attempt1Valid, attempt2Valid);

  // ── Build result from selected attempt ────────────────────────────────────
  if (!selectedAttempt || !selectedAttempt.parsedOutput) {
    // Both attempts failed
    const debug: JudgeDebug = {
      parseStrategy: "default",
      rawJudgeText: attempt1.assistantText || attempt2.assistantText || "",
      parseErrors: [
        ...(attempt1.error ? [`[attempt_1] Provider error: ${attempt1.error}`] : []),
        ...(attempt1.parsedOutput?.parseErrors ?? []).map(e => `[attempt_1] ${e}`),
        ...(attempt2.error ? [`[attempt_2] Provider error: ${attempt2.error}`] : []),
        ...(attempt2.parsedOutput?.parseErrors ?? []).map(e => `[attempt_2] ${e}`),
      ],
      rawLines: [],
      exitCode: attempt1.exitCode,
      providerError: attempt1.error ?? attempt2.error ?? null,
    };

    return {
      ...buildFailResult(usedScreenshot, debug, options.humanBaselineSteps),
      judgeAttempts,
      judgeSelectedAttempt,
      judgeMismatch,
      renderedContext,
    };
  }

  // ── Apply rubrics ─────────────────────────────────────────────────────────
  const raw: JudgeRawOutput = selectedAttempt.parsedOutput.output;
  const analysis = applyRubrics(raw, options.humanBaselineSteps);

  // ── Normalize to backward-compatible score ────────────────────────────────
  const score = raw.verdict === "PASS" ? 100 : raw.verdict === "PARTIAL" ? 50 : 0;

  const debug: JudgeDebug = {
    parseStrategy: selectedAttempt.parsedOutput.strategy,
    rawJudgeText: selectedAttempt.parsedOutput.rawText,
    parseErrors: selectedAttempt.parsedOutput.parseErrors,
    rawLines: [],
    exitCode: selectedAttempt.exitCode,
    providerError: selectedAttempt.error,
  };

  return {
    verdict: raw.verdict,
    score,
    reason: raw.rationale,
    usedScreenshot,
    completionScore: raw.completionScore,
    analysis,
    judgeDebug: debug,
    judgeAttempts,
    judgeSelectedAttempt,
    judgeMismatch,
    renderedContext,
  };
}

// ─── Single attempt runner ────────────────────────────────────────────────────

async function runSingleAttempt(
  prompt: string,
  providerOpts: ProviderOptions
): Promise<JudgeAttemptResult> {
  try {
    const providerResult = await runJudgeAgent(prompt, providerOpts);
    const textToParse = providerResult.assistantText || providerResult.rawStdout;
    const parsedOutput = parseJudgeOutput(textToParse);

    return {
      rawStdout: providerResult.rawStdout,
      assistantText: providerResult.assistantText,
      parsedOutput,
      error: null,
      exitCode: providerResult.exitCode,
    };
  } catch (err) {
    return {
      rawStdout: "",
      assistantText: "",
      parsedOutput: null,
      error: err instanceof Error ? err.message : String(err),
      exitCode: null,
    };
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * An attempt is "valid" if it parsed successfully beyond the legacy/default fallback.
 * strategy === "strict" or "fallback" means actual JSON was extracted.
 */
function isAttemptValid(attempt: JudgeAttemptResult): boolean {
  return attempt.parsedOutput !== null && attempt.parsedOutput.strategy !== "default";
}

/**
 * Compare two valid attempts for mismatch on key numeric fields.
 */
function detectMismatch(
  attempt1: JudgeAttemptResult,
  attempt2: JudgeAttemptResult,
  attempt1Valid: boolean,
  attempt2Valid: boolean
): JudgeMismatch {
  if (!attempt1Valid || !attempt2Valid) {
    return { detected: false, fields: [] };
  }

  const out1 = attempt1.parsedOutput!.output;
  const out2 = attempt2.parsedOutput!.output;
  const diffFields: string[] = [];

  for (const field of MISMATCH_FIELDS) {
    if (out1[field] !== out2[field]) {
      diffFields.push(field);
    }
  }

  return { detected: diffFields.length > 0, fields: diffFields };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildJudgePrompt(
  taskName: string,
  taskInstruction: string,
  renderedAgentOutput: string,
  screenshotB64: string | null,
  screenshotPath: string | null,
  outputFiles?: string[],
  expectedOutputFile?: string
): string {
  const lines: string[] = [];

  lines.push(`TASK NAME: ${taskName}`);
  lines.push(`TASK INSTRUCTION:`);
  lines.push(taskInstruction.trim());
  lines.push(``);
  lines.push(`AGENT OUTPUT:`);
  lines.push(`---`);
  lines.push(renderedAgentOutput);
  lines.push(`---`);

  if (outputFiles && outputFiles.length > 0) {
    lines.push(``);
    lines.push(`PRODUCED OUTPUT FILES:`);
    for (const f of outputFiles) lines.push(`  - ${f}`);
  }

  if (expectedOutputFile) {
    lines.push(``);
    lines.push(`EXPECTED OUTPUT FILE (reference answer):`);
    lines.push(`  - ${expectedOutputFile}`);
  }

  if (screenshotPath) {
    lines.push(``);
    if (screenshotB64) {
      lines.push(`SCREENSHOT: A screenshot was saved at: ${screenshotPath}`);
      lines.push(`Use the visual evidence from the screenshot to inform your verdict.`);
    } else {
      lines.push(
        `SCREENSHOT NOTE: A screenshot was expected at ${screenshotPath} but could not be read.`
      );
    }
  }

  lines.push(``);
  lines.push(`Output your verdict now as a single JSON object. No prose, no markdown fences.`);

  return lines.join("\n");
}

// ─── Screenshot resolution ────────────────────────────────────────────────────

function resolveScreenshot(
  screenshotPath?: string,
  runDir?: string
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
  humanBaselineSteps?: number
): Omit<
  JudgeEngineResult,
  "judgeAttempts" | "judgeSelectedAttempt" | "judgeMismatch" | "renderedContext"
> {
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
