/**
 * run-eval.ts — Eval CLI
 *
 * Usage:
 *   bun run-eval.ts               # run all tasks
 *   bun run-eval.ts EVAL_006      # run a single task by ID
 *   bun run-eval.ts --list        # list available tasks
 *
 * Results are saved to:
 *   eval/eval-results/<modelName>/
 *     <taskId>/
 *       agent-output.jsonl         — full raw agent output
 *       judge/
 *         context-sent.md          — rendered context sent to judge
 *         attempt_1/               — first judge attempt artifacts
 *         attempt_2/               — second judge attempt artifacts
 *       screenshots/               — captured screenshots
 *     errors/
 *       <taskId>.json              — tasks where both judge attempts failed
 *     summary.json                 — scores, tokens, judge verdicts
 */

import { mkdirSync, existsSync, renameSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAllTasks, getTaskById, loadEvalConfig } from "./src/eval/tasks";
import { runTask, runAllTasks, type TaskRunResult } from "./src/eval/runner";
import { aggregateRun, type TaskResultForAggregation } from "./src/eval/aggregates";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const evalRoot = join(projectRoot, "eval");
const resultsRoot = join(evalRoot, "eval-results");

// ─── Main script ──────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);

  if (args.includes("--list") || args.includes("-l")) {
    const tasks = await getAllTasks();
    console.log("\nAvailable eval tasks:\n");
    for (const t of tasks) {
      const judge = t.llmJudge ? " [+judge]" : "";
      const shot = t.screenshotPath ? ` [screenshot: ${t.screenshotPath}]` : "";
      console.log(`  ${t.id}  [${t.category}]${judge}${shot}  ${t.name}`);
    }
    console.log();
    return;
  }

  const taskId = args.find(a => !a.startsWith("-"));

  // ─── Determine model name ──────────────────────────────────────────────────

  const { defaultModel } = await loadEvalConfig();

  // ─── Create model directory (overwrites previous run for this model) ───────

  function makeModelDir(modelName: string): string {
    const safeName = modelName.replace(/[/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");
    const dir = join(resultsRoot, safeName);
    // Overwrite entire model dir on each run
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ─── Main ─────────────────────────────────────────────────────────────────────

  if (taskId) {
    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      console.error(`Run with --list to see available tasks.`);
      process.exit(1);
    }

    const modelName = task.model || defaultModel;
    const modelDir = makeModelDir(modelName);

    console.log("=".repeat(60));
    console.log("  OpenCode Agent-Browser Eval");
    console.log(`  Model : ${modelName}`);
    console.log(`  Run dir: ${modelDir}`);
    console.log("=".repeat(60));

    console.log(`\nRunning: ${task.name} (${task.id})`);
    if (task.llmJudge) console.log(`  Scoring: keyword + LLM judge`);
    console.log();

    const result = await runTask(task, modelDir);
    printResult(result, true);
    await saveResults([result], modelDir, modelName);
  } else {
    const tasks = await getAllTasks();

    // Use first task's model or defaultModel for the run directory
    const modelName = defaultModel;
    const modelDir = makeModelDir(modelName);

    console.log("=".repeat(60));
    console.log("  OpenCode Agent-Browser Eval");
    console.log(`  Model : ${modelName}`);
    console.log(`  Run dir: ${modelDir}`);
    console.log("=".repeat(60));

    console.log(`\nRunning ${tasks.length} tasks...\n`);
    const results = await runAllTasks(tasks, modelDir, r => printResult(r, false));
    printSummary(results);
    await saveResults(results, modelDir, modelName);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});

// ─── Output formatting ────────────────────────────────────────────────────────

function statusIcon(status: TaskRunResult["status"]): string {
  return {
    pass: "[PASS]",
    partial: "[PART]",
    fail: "[FAIL]",
    error: "[ERR ]",
    timeout: "[TIME]",
  }[status];
}

function printResult(r: TaskRunResult, verbose: boolean) {
  const icon = statusIcon(r.status);
  const time = (r.elapsedMs / 1000).toFixed(1) + "s";
  const tok = r.tokens ? `  in=${r.tokens.inputTokens} out=${r.tokens.outputTokens}` : "";
  const toolCalls = r.toolCallCount != null ? `  tools=${r.toolCallCount}` : "";
  const scoreDetail =
    r.judgeScore !== null
      ? `score=${r.score}/100 (kw=${r.keywordScore} judge=${r.judgeScore})`
      : `score=${r.score}/100`;

  console.log(
    `${icon}  ${r.taskId}  ${scoreDetail}  time=${time}${tok}${toolCalls}  ${r.taskName}`
  );

  if (r.judge) {
    const shot = r.judge.usedScreenshot ? " [+screenshot]" : "";
    console.log(`       Judge: ${r.judge.verdict}${shot} — ${r.judge.reason}`);
  }
  if (r.judgeSelectedAttempt) {
    console.log(`       Selected: ${r.judgeSelectedAttempt}`);
  }
  if (r.judgeMismatch?.detected) {
    console.log(`       Mismatch: fields=[${r.judgeMismatch.fields.join(", ")}]`);
  }
  // Log judge failures: both attempts failed
  if (r.judgeAttempts && r.judgeSelectedAttempt === null) {
    const failedAttempts = r.judgeAttempts.filter(a => a.error || a.parsedOutput === null);
    if (failedAttempts.length > 0) {
      console.log(`       Judge: BOTH attempts failed (${failedAttempts.length} failures)`);
      for (let i = 0; i < failedAttempts.length; i++) {
        const a = failedAttempts[i];
        if (a.error) console.log(`         attempt_${i + 1}: ${a.error}`);
      }
    }
  }
  if (r.error) {
    console.log(`       Error: ${r.error}`);
  }
  if (verbose && r.output) {
    console.log("\n--- opencode output ---");
    console.log(r.output.trim());
    console.log("-".repeat(60));
  }
}

function printSummary(results: TaskRunResult[]) {
  const pass = results.filter(r => r.status === "pass").length;
  const partial = results.filter(r => r.status === "partial").length;
  const fail = results.filter(r => r.status === "fail").length;
  const errors = results.filter(r => r.status === "error" || r.status === "timeout").length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const totalTime = (results.reduce((s, r) => s + r.elapsedMs, 0) / 1000).toFixed(1);
  const totalIn = results.reduce((s, r) => s + (r.tokens?.inputTokens ?? 0), 0);
  const totalOut = results.reduce((s, r) => s + (r.tokens?.outputTokens ?? 0), 0);

  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Tasks     : ${results.length}`);
  console.log(`  Pass      : ${pass}`);
  console.log(`  Partial   : ${partial}`);
  console.log(`  Fail      : ${fail}`);
  console.log(`  Errors    : ${errors}`);
  console.log(`  Avg score : ${avgScore}/100`);
  console.log(`  Total time: ${totalTime}s`);
  console.log(`  Tokens    : ${totalIn} in / ${totalOut} out`);
  console.log("=".repeat(60) + "\n");
}

// ─── Save results ─────────────────────────────────────────────────────────────

async function saveResults(results: TaskRunResult[], modelDir: string, modelName: string) {
  // ── (a) Per-task artifact persistence ──────────────────────────────────────

  for (const r of results) {
    const taskDir = join(modelDir, r.taskId);
    mkdirSync(taskDir, { recursive: true });

    // agent-output.jsonl — full raw agent output
    await Bun.write(join(taskDir, "agent-output.jsonl"), r.output ?? "");

    // judge/context-sent.md — rendered context sent to the judge
    if (r.renderedContext) {
      const judgeDir = join(taskDir, "judge");
      mkdirSync(judgeDir, { recursive: true });
      await Bun.write(join(judgeDir, "context-sent.md"), r.renderedContext);
    }

    // judge/attempt_N/ — per-attempt artifacts
    if (r.judgeAttempts && r.judgeAttempts.length > 0) {
      for (let i = 0; i < r.judgeAttempts.length; i++) {
        const attempt = r.judgeAttempts[i];
        const attemptDir = join(taskDir, "judge", `attempt_${i + 1}`);
        mkdirSync(attemptDir, { recursive: true });

        await Bun.write(join(attemptDir, "raw-stdout.jsonl"), attempt.rawStdout ?? "");
        await Bun.write(join(attemptDir, "assistant-text.txt"), attempt.assistantText ?? "");
        await Bun.write(
          join(attemptDir, "parsed-output.json"),
          attempt.parsedOutput != null ? JSON.stringify(attempt.parsedOutput, null, 2) : "null"
        );
      }
    }

    // screenshots/ — move any matching screenshots from cwd
    const possibleShots = ["eval-minecraft.png", "eval-form-result.png", "eval-screenshot.png"];
    for (const shot of possibleShots) {
      const src = join(process.cwd(), shot);
      if (existsSync(src)) {
        const screenshotDir = join(taskDir, "screenshots");
        mkdirSync(screenshotDir, { recursive: true });
        try {
          renameSync(src, join(screenshotDir, shot));
        } catch {
          /* ignore move failures */
        }
      }
    }
  }

  // ── (b) Error persistence — tasks where both judge attempts failed ─────────

  const judgeErrors = results.filter(
    r => r.judgeSelectedAttempt === null && r.judgeAttempts && r.judgeAttempts.length > 0
  );

  if (judgeErrors.length > 0) {
    const errorsDir = join(modelDir, "errors");
    mkdirSync(errorsDir, { recursive: true });

    for (const r of judgeErrors) {
      const errorPayload = {
        taskId: r.taskId,
        taskName: r.taskName,
        model: r.model,
        judgeSelectedAttempt: r.judgeSelectedAttempt,
        attempts: (r.judgeAttempts ?? []).map((a, i) => ({
          attempt: `attempt_${i + 1}`,
          error: a.error,
          exitCode: a.exitCode,
          parsedOutput: a.parsedOutput,
          assistantTextLength: a.assistantText?.length ?? 0,
          rawStdoutLength: a.rawStdout?.length ?? 0,
        })),
      };
      await Bun.write(join(errorsDir, `${r.taskId}.json`), JSON.stringify(errorPayload, null, 2));
    }
  }

  // ── (c) summary.json — model-level summary (no output or judgeDebug) ───────

  const summary = {
    runAt: new Date().toISOString(),
    model: modelName,
    runDir: modelDir,
    results: results.map(r => ({
      id: r.taskId,
      name: r.taskName,
      model: r.model,
      status: r.status,
      score: r.score,
      keywordScore: r.keywordScore,
      judgeScore: r.judgeScore,
      judge: r.judge
        ? {
            verdict: r.judge.verdict,
            score: r.judge.score,
            reason: r.judge.reason,
            usedScreenshot: r.judge.usedScreenshot,
          }
        : null,
      judgeSelectedAttempt: r.judgeSelectedAttempt ?? null,
      judgeMismatch: r.judgeMismatch ?? null,
      toolCallCount: r.toolCallCount ?? null,
      elapsedMs: r.elapsedMs,
      tokens: r.tokens
        ? {
            inputTokens: r.tokens.inputTokens,
            outputTokens: r.tokens.outputTokens,
            totalTokens: r.tokens.totalTokens,
            byModel: r.tokens.byModel,
          }
        : null,
      error: r.error,
      analysis: r.analysis
        ? {
            efficiency: r.analysis.efficiency,
            error: r.analysis.error,
            safety: r.analysis.safety,
            thrashing: r.analysis.thrashing,
          }
        : null,
      telemetry: r.telemetry
        ? {
            observedCommands: r.telemetry.observedCommands,
            redundantCommandCount: r.telemetry.redundantCommandCount,
            thrashRatio: r.telemetry.thrashRatio,
            inferredErrorCategory: r.telemetry.inferredErrorCategory,
            timeoutDetected: r.telemetry.timeoutDetected,
            errorDetected: r.telemetry.errorDetected,
          }
        : null,
    })),

    // Run-level analysis
    analysis: aggregateRun(results as TaskResultForAggregation[]),
  };

  const summaryPath = join(modelDir, "summary.json");
  await Bun.write(summaryPath, JSON.stringify(summary, null, 2));

  // ── (d) Global summary — eval/eval-results.json ────────────────────────────

  const globalSummaryPath = join(evalRoot, "eval-results.json");
  await Bun.write(globalSummaryPath, JSON.stringify(summary, null, 2));

  // ── Console output ─────────────────────────────────────────────────────────

  console.log(`\nResults saved to ${modelDir}/`);
  console.log(`  summary.json`);
  console.log(`  <taskId>/agent-output.jsonl (per task)`);
  console.log(`  <taskId>/judge/ (context + attempt artifacts)`);
  if (judgeErrors.length > 0) {
    console.log(`  errors/ (${judgeErrors.length} judge failure(s))`);
  }
}
