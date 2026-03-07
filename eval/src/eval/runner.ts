/**
 * Eval Runner
 *
 * Runs a single EvalTask by spawning `opencode run <prompt>` and capturing
 * its stdout. Optionally runs LLM-as-judge after keyword scoring.
 */

import type { EvalTask } from "./tasks";
import { DEFAULT_MODEL } from "./tasks";
import { getSessionTokensSince, type TokenUsage } from "./opencode-tokens";
import { judgeTask, type JudgeResult } from "./judge";
import { extractTelemetry, type TelemetryResult } from "./telemetry";
import type { TaskAnalysis } from "./judge/rubrics";
import type { JudgeDebug } from "./judge/engine";

export interface TaskRunResult {
  taskId: string;
  taskName: string;
  /** Model used to run this task */
  model: string;
  status: "pass" | "partial" | "fail" | "error" | "timeout";
  /** Keyword/regex score 0–100 */
  keywordScore: number;
  /** LLM judge score 0–100 (null if llmJudge not enabled) */
  judgeScore: number | null;
  /** Final score: average of keywordScore + judgeScore (or just keywordScore) */
  score: number;
  /** Full raw stdout from opencode — never truncated */
  output: string;
  elapsedMs: number;
  tokens: TokenUsage | null;
  judge: JudgeResult | null;
  error?: string;

  // ── Phase 2: per-task analysis ─────────────────────────────────────────────
  /** Rubric-mapped analysis from the judge (efficiency/error/safety/thrashing) */
  analysis?: TaskAnalysis | null;
  /** Debug payload for diagnosing judge parse failures */
  judgeDebug?: JudgeDebug | null;
  /** Heuristic telemetry extracted directly from agent stdout */
  telemetry?: TelemetryResult | null;
}

const PASS_THRESHOLD = 80;
const PARTIAL_THRESHOLD = 30;

/**
 * Run a single task: spawn opencode, capture full output, score it.
 */
export async function runTask(task: EvalTask, runDir?: string): Promise<TaskRunResult> {
  const timeoutMs = (task.timeoutSeconds ?? 120) * 1000;
  const start = Date.now();

  // ── 1. Run the agent ──────────────────────────────────────────────────────
  let output = "";
  let error: string | undefined;

  try {
    // Force the agent to run its end-of-session memory procedures
    const forcedPrompt = task.prompt + "\n\nWhen finished, the user signals 'wrap up' so you MUST run your end-of-session memory protocol (mem journal) as instructed in AGENTS.md.";
    output = await runOpencode(forcedPrompt, task.model, timeoutMs);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    const elapsed = Date.now() - start;
    return {
      taskId: task.id,
      taskName: task.name,
      model: task.model || "DEFAULT_MODEL",
      status: error.includes("timeout") ? "timeout" : "error",
      keywordScore: 0,
      judgeScore: null,
      score: 0,
      output: "",
      elapsedMs: elapsed,
      tokens: null,
      judge: null,
      analysis: null,
      judgeDebug: null,
      telemetry: null,
      error,
    };
  }

  const elapsed = Date.now() - start;

  // ── 2. Keyword scoring ────────────────────────────────────────────────────
  const keywordScore = task.scorer(output);

  // ── 3. Token usage ────────────────────────────────────────────────────────
  const tokens = await getSessionTokensSince(start).catch(() => null);

  // ── 4. Telemetry extraction (heuristic, no subprocess) ────────────────────
  const telemetry = extractTelemetry(output);

  // ── 5. LLM judge (optional) ───────────────────────────────────────────────
  let judge: JudgeResult | null = null;
  let judgeScore: number | null = null;

  if (task.llmJudge) {
    judge = await judgeTask(task.name, task.prompt, output, task.screenshotPath, runDir, {
      humanBaselineSteps: task.humanBaselineSteps,
    }).catch(e => ({
      verdict: "FAIL" as const,
      score: 0,
      reason: `Judge error: ${e instanceof Error ? e.message : String(e)}`,
      usedScreenshot: false,
    }));
    judgeScore = judge.score;
  }

  // ── 6. Final score = average of both (or just keyword if no judge) ────────
  const score = judgeScore !== null ? Math.round((keywordScore + judgeScore) / 2) : keywordScore;

  const status = score >= PASS_THRESHOLD ? "pass" : score >= PARTIAL_THRESHOLD ? "partial" : "fail";

  return {
    taskId: task.id,
    taskName: task.name,
    model: task.model || "DEFAULT_MODEL",
    status,
    keywordScore,
    judgeScore,
    score,
    output,
    elapsedMs: elapsed,
    tokens,
    judge,
    analysis: judge?.analysis ?? null,
    judgeDebug: judge?.judgeDebug ?? null,
    telemetry,
  };
}

/**
 * Run all tasks sequentially and return results.
 */
export async function runAllTasks(
  tasks: EvalTask[],
  runDir?: string,
  onResult?: (result: TaskRunResult) => void
): Promise<TaskRunResult[]> {
  const results: TaskRunResult[] = [];
  for (const task of tasks) {
    const result = await runTask(task, runDir);
    results.push(result);
    onResult?.(result);
  }
  return results;
}

// ─── Internal: spawn opencode ─────────────────────────────────────────────────

async function runOpencode(
  prompt: string,
  model: string | undefined,
  timeoutMs: number
): Promise<string> {
  const args = ["run", prompt];
  if (model) args.push("--model", model);
  // Default model if none specified
  if (!model) args.push("--model", "DEFAULT_MODEL");

  const proc = Bun.spawn(["opencode", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const result = await Promise.race([collectOutput(proc), timeout(timeoutMs)]);

  if (result === "TIMEOUT") {
    proc.kill();
    throw new Error(`timeout after ${timeoutMs / 1000}s`);
  }

  const { stdout, stderr, exitCode } = result as {
    stdout: string;
    stderr: string;
    exitCode: number;
  };

  if (exitCode !== 0) {
    // Include stderr in the error message for diagnostics
    const detail = stderr.trim() ? `stderr: ${stderr.trim().slice(0, 300)}` : stdout.slice(0, 200);
    throw new Error(`opencode exited with code ${exitCode}: ${detail}`);
  }

  // Detect silent failures: model errors exit with code 0 but produce no output
  if (!stdout.trim()) {
    const stderrSnippet = stderr.trim().slice(0, 400);
    const hint = stderrSnippet ? ` (stderr: ${stderrSnippet})` : " (no stderr output either)";
    throw new Error(
      `opencode returned empty output — possible model or configuration error${hint}`
    );
  }

  return stdout;
}

async function collectOutput(proc: ReturnType<typeof Bun.spawn>) {
  const readStream = async (s: unknown): Promise<string> => {
    if (!s || typeof s !== "object") return "";
    return new Response(s as ReadableStream).text();
  };
  const [stdout, stderr] = await Promise.all([readStream(proc.stdout), readStream(proc.stderr)]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function timeout(ms: number): Promise<"TIMEOUT"> {
  return new Promise(resolve => setTimeout(() => resolve("TIMEOUT"), ms));
}
