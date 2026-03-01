/**
 * run-eval.ts — Eval CLI
 *
 * Usage:
 *   bun run-eval.ts               # run all tasks
 *   bun run-eval.ts EVAL_006      # run a single task by ID
 *   bun run-eval.ts --list        # list available tasks
 *
 * Results are saved to:
 *   eval/eval-results/<YYYY-MM-DD_HH-MM-SS>/
 *     summary.json      — scores, tokens, judge verdicts for all tasks
 *     <TASK_ID>.txt     — full raw output for each task
 *     *.png             — screenshots moved here from cwd
 */

import { mkdirSync, existsSync, renameSync } from "fs";
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

  // ─── Create run directory ─────────────────────────────────────────────────────

  function makeRunDir(): string {
    const now = new Date();
    const ts = now.toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19); // YYYY-MM-DD_HH-MM-SS
    const dir = join(resultsRoot, ts);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ─── Main ─────────────────────────────────────────────────────────────────────

  const runDir = makeRunDir();

  console.log("=".repeat(60));
  console.log("  OpenCode Agent-Browser Eval");
  console.log(`  Run dir: ${runDir}`);
  console.log("=".repeat(60));

  if (taskId) {
    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      console.error(`Run with --list to see available tasks.`);
      process.exit(1);
    }
    console.log(`\nRunning: ${task.name} (${task.id})`);
    if (task.llmJudge) console.log(`  Scoring: keyword + LLM judge`);
    console.log();

    const result = await runTask(task, runDir);
    printResult(result, true);
    await saveResults([result], runDir);
  } else {
    const tasks = await getAllTasks();
    console.log(`\nRunning ${tasks.length} tasks...\n`);
    const results = await runAllTasks(tasks, runDir, r => printResult(r, false));
    printSummary(results);
    await saveResults(results, runDir);
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
  const scoreDetail =
    r.judgeScore !== null
      ? `score=${r.score}/100 (kw=${r.keywordScore} judge=${r.judgeScore})`
      : `score=${r.score}/100`;

  console.log(`${icon}  ${r.taskId}  ${scoreDetail}  time=${time}${tok}  ${r.taskName}`);

  if (r.judge) {
    const shot = r.judge.usedScreenshot ? " [+screenshot]" : "";
    console.log(`       Judge: ${r.judge.verdict}${shot} — ${r.judge.reason}`);
  }
  // Log judge parse failures with debug info
  if (r.judgeDebug && r.judgeDebug.parseStrategy === "default") {
    console.log(`       Judge parse FAILED (strategy: ${r.judgeDebug.parseStrategy})`);
    for (const err of r.judgeDebug.parseErrors) {
      console.log(`         ${err}`);
    }
    if (r.judgeDebug.rawJudgeText) {
      const preview = r.judgeDebug.rawJudgeText.slice(0, 300);
      console.log(`       Raw judge text (${r.judgeDebug.rawJudgeText.length} chars): ${preview}`);
    }
    if (r.judgeDebug.providerError) {
      console.log(`       Provider error: ${r.judgeDebug.providerError}`);
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

async function saveResults(results: TaskRunResult[], runDir: string) {
  const { defaultModel } = await loadEvalConfig();

  // Store full output directly in JSON
  const summary = {
    runAt: new Date().toISOString(),
    model: defaultModel,
    runDir,
    results: results.map(r => ({
      // ── Existing fields (unchanged) ──────────────────────────────────
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
      elapsedMs: r.elapsedMs,
      tokens: r.tokens
        ? {
            inputTokens: r.tokens.inputTokens,
            outputTokens: r.tokens.outputTokens,
            totalTokens: r.tokens.totalTokens,
            byModel: r.tokens.byModel,
          }
        : null,
      output: r.output, // Full output stored directly in JSON
      error: r.error,

      // ── New Phase 2 analysis fields (backward-compatible addition) ───
      analysis: r.analysis
        ? {
            efficiency: r.analysis.efficiency,
            error: r.analysis.error,
            safety: r.analysis.safety,
            thrashing: r.analysis.thrashing,
          }
        : null,
      judgeDebug: r.judgeDebug
        ? {
            parseStrategy: r.judgeDebug.parseStrategy,
            parseErrors: r.judgeDebug.parseErrors,
            exitCode: r.judgeDebug.exitCode,
            providerError: r.judgeDebug.providerError,
            // Include raw judge text and lines for diagnosing failures
            rawJudgeText: r.judgeDebug.rawJudgeText || null,
            rawLines: r.judgeDebug.rawLines || null,
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

    // ── Run-level analysis (Phase 3) ──────────────────────────────────────
    analysis: aggregateRun(results as TaskResultForAggregation[]),
  };

  const summaryPath = join(runDir, "summary.json");
  await Bun.write(summaryPath, JSON.stringify(summary, null, 2));

  // Store the latest run summary under eval/eval-results.json
  const globalSummaryPath = join(evalRoot, "eval-results.json");
  await Bun.write(globalSummaryPath, JSON.stringify(summary, null, 2));

  // Move any screenshots from cwd into the run directory
  for (const r of results) {
    const possibleShots = ["eval-minecraft.png", "eval-form-result.png", "eval-screenshot.png"];
    for (const shot of possibleShots) {
      const src = join(process.cwd(), shot);
      const dst = join(runDir, shot);
      if (existsSync(src)) {
        try {
          renameSync(src, dst);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Write judge debug log for any tasks where the judge failed to parse
  const judgeFailures = results.filter(
    r => r.judgeDebug && r.judgeDebug.parseStrategy === "default"
  );
  if (judgeFailures.length > 0) {
    const debugLog = judgeFailures
      .map(r => {
        const d = r.judgeDebug!;
        return [
          `${"=".repeat(60)}`,
          `TASK: ${r.taskId} — ${r.taskName}`,
          `Parse strategy: ${d.parseStrategy}`,
          `Exit code: ${d.exitCode}`,
          `Provider error: ${d.providerError ?? "none"}`,
          `Parse errors:`,
          ...d.parseErrors.map(e => `  - ${e}`),
          ``,
          `--- Raw judge text (${d.rawJudgeText?.length ?? 0} chars) ---`,
          d.rawJudgeText || "(empty)",
          `--- End raw judge text ---`,
          ``,
          `--- Raw JSONL lines (${d.rawLines?.length ?? 0}) ---`,
          ...(d.rawLines ?? []).map((l, i) => `  [${i}] ${l}`),
          `--- End raw JSONL lines ---`,
          ``,
        ].join("\n");
      })
      .join("\n");

    const debugPath = join(runDir, "judge-debug.log");
    await Bun.write(debugPath, debugLog);
    console.log(`  judge-debug.log (${judgeFailures.length} failed judge parse(s))`);
  }

  console.log(`\nResults saved to ${runDir}/`);
  console.log(`  summary.json (with full outputs + analysis)`);
}
