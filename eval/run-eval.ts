/**
 * run-eval.ts — Eval CLI
 *
 * Usage:
 *   bun run-eval.ts                                          # run all tasks (default config + models.json)
 *   bun run-eval.ts --config eval-config-coding.json         # run all tasks from a specific config
 *   bun run-eval.ts --models models.json                     # explicit models file (default: eval/models.json)
 *   bun run-eval.ts --task EVAL_006                          # run a single task by ID
 *   bun run-eval.ts --list                                   # list available tasks
 *
 * Results are saved to:
 *   eval/eval-results/<modelName>/<domain>/
 *     <taskId>_<task-slug>/
 *       agent-output.jsonl         — full raw agent output
 *       judge/
 *         context-sent.md          — rendered context sent to judge
 *         attempt_1/               — first judge attempt artifacts
 *         attempt_2/               — second judge attempt artifacts
 *       screenshots/               — captured screenshots
 *     errors/
 *       <taskId>.json              — tasks where both judge attempts failed
 *     summary.json                 — scores, tokens, judge verdicts
 *
 * Re-running the same config+model pair wipes only that <domain>/ folder,
 * leaving other domains for the same model intact.
 */

import { mkdirSync, existsSync, renameSync, rmSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { getAllTasks, getTaskById, loadEvalConfig } from "./src/eval/tasks";
import { runTask, runAllTasks, type TaskRunResult } from "./src/eval/runner";
import { aggregateRun, type TaskResultForAggregation } from "./src/eval/aggregates";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsRoot = join(__dirname, "eval-results");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sanitize a string for use as a directory name */
function safeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

/** Slugify a task name for use in folder names (lowercase, hyphens) */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Ensures the domain directory exists without wiping it.
 * Used by both single-task and full-run modes — other task folders are preserved.
 */
function ensureDomainDir(modelName: string, domainName: string): string {
  const dir = join(resultsRoot, safeName(modelName), safeName(domainName));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Wipes only the specific task subfolder and recreates it.
 * All sibling task folders are left untouched.
 */
function makeTaskDir(domainDir: string, taskId: string, taskName: string): string {
  const dir = join(domainDir, taskDirName(taskId, taskName));
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Returns the per-task directory path inside a domain dir */
function taskDirName(taskId: string, taskName: string): string {
  return `${taskId}_${slugify(taskName)}`;
}

/**
 * Moves all files from <projectRoot>/outputs/ into <taskDir>/outputs/,
 * preserving subdirectory structure (e.g. outputs/tools/ → <taskDir>/outputs/tools/).
 * After the move, recreates empty outputs/ and outputs/tools/ in the project root
 * so the next task starts with a clean slate.
 */
function moveOutputsToTaskDir(taskDir: string): void {
  const projectRoot = process.cwd();
  const srcRoot = join(projectRoot, "outputs");
  const destRoot = join(taskDir, "outputs");

  if (existsSync(srcRoot)) {
    _moveFilesRecursive(srcRoot, destRoot);
  }

  // Always recreate the empty shell directories so the next task can write to them
  mkdirSync(join(projectRoot, "outputs", "tools"), { recursive: true });
}

/** Recursively moves all files from src into dest, preserving subdirectory structure. */
function _moveFilesRecursive(src: string, dest: string): void {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      _moveFilesRecursive(srcPath, destPath);
    } else {
      mkdirSync(dest, { recursive: true });
      try {
        renameSync(srcPath, destPath);
      } catch {
        /* ignore move failures (e.g. cross-device) */
      }
    }
  }
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function parseArgs(args: string[]): {
  configFile: string | undefined;
  modelsFile: string | undefined;
  taskId: string | undefined;
  list: boolean;
} {
  const configIdx = args.indexOf("--config");
  const modelsIdx = args.indexOf("--models");
  const taskIdx = args.indexOf("--task");

  return {
    configFile: configIdx !== -1 ? args[configIdx + 1] : undefined,
    modelsFile: modelsIdx !== -1 ? args[modelsIdx + 1] : undefined,
    taskId: taskIdx !== -1 ? args[taskIdx + 1] : undefined,
    list: args.includes("--list") || args.includes("-l"),
  };
}

/** Load models from models.json (defaults to eval/models.json) */
async function loadModels(modelsFile?: string): Promise<string[]> {
  const resolvedPath = modelsFile ? resolve(modelsFile) : join(__dirname, "models.json");

  const text = await Bun.file(resolvedPath).text();
  const parsed = JSON.parse(text) as { models: string[] };
  if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
    throw new Error(`No models found in ${resolvedPath}`);
  }
  return parsed.models;
}

// ─── Main script ──────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const { configFile, modelsFile, taskId, list } = parseArgs(args);

  // Resolve config path: absolute paths used as-is; relative paths are
  // resolved first relative to the eval/ directory (where run-eval.ts lives),
  // then relative to eval/tasks/ as a fallback, and finally relative to cwd.
  let configPath: string | undefined;
  if (configFile) {
    if (
      configFile.startsWith("/") ||
      configFile.startsWith("\\") ||
      /^[A-Za-z]:/.test(configFile)
    ) {
      // Absolute path — use as-is
      configPath = configFile;
    } else {
      // Relative path — try eval/ dir first, then eval/tasks/, then cwd
      const candidateEval = join(__dirname, configFile);
      const candidateTasks = join(__dirname, "tasks", configFile);
      const candidateCwd = resolve(configFile);
      if (existsSync(candidateEval)) {
        configPath = candidateEval;
      } else if (existsSync(candidateTasks)) {
        configPath = candidateTasks;
      } else {
        configPath = candidateCwd; // will fail with a clear error if not found
      }
    }
  }

  if (list) {
    const tasks = await getAllTasks(configPath);
    console.log("\nAvailable eval tasks:\n");
    for (const t of tasks) {
      const judge = t.llmJudge ? " [+judge]" : "";
      const shot = t.screenshotPath ? ` [screenshot: ${t.screenshotPath}]` : "";
      console.log(`  ${t.id}  [${t.category}]${judge}${shot}  ${t.name}`);
    }
    console.log();
    return;
  }

  const { name: domainName, defaultModel } = await loadEvalConfig(configPath);
  const models = await loadModels(modelsFile);

  if (taskId) {
    // ── Single task mode ────────────────────────────────────────────────────
    const task = await getTaskById(taskId, configPath);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      console.error(`Run with --list to see available tasks.`);
      process.exit(1);
    }

    // Single task: run against all models sequentially
    for (const modelId of models) {
      const domainDir = ensureDomainDir(modelId, domainName);
      makeTaskDir(domainDir, task.id, task.name);

      console.log("=".repeat(60));
      console.log("  OpenCode Agent-Browser Eval");
      console.log(`  Domain : ${domainName}`);
      console.log(`  Model  : ${modelId}`);
      console.log(`  Run dir: ${domainDir}`);
      console.log("=".repeat(60));
      console.log(`\nRunning: ${task.name} (${task.id})\n`);

      const taskWithModel = { ...task, model: modelId };
      const result = await runTask(taskWithModel, domainDir);
      moveOutputsToTaskDir(join(domainDir, taskDirName(task.id, task.name)));
      printResult(result, true);
      await saveResults([result], domainDir, modelId, domainName);
    }
  } else {
    // ── Full run mode ───────────────────────────────────────────────────────
    const tasks = await getAllTasks(configPath);

    for (const modelId of models) {
      const domainDir = ensureDomainDir(modelId, domainName);

      console.log("=".repeat(60));
      console.log("  OpenCode Agent-Browser Eval");
      console.log(`  Domain : ${domainName}`);
      console.log(`  Model  : ${modelId}`);
      console.log(`  Run dir: ${domainDir}`);
      console.log("=".repeat(60));
      console.log(`\nRunning ${tasks.length} tasks...\n`);

      // Override model on every task with the current model from the list
      const tasksForModel = tasks.map(t => ({ ...t, model: modelId }));
      const results: TaskRunResult[] = [];
      for (const task of tasksForModel) {
        makeTaskDir(domainDir, task.id, task.name);
        const result = await runTask(task, domainDir);
        moveOutputsToTaskDir(join(domainDir, taskDirName(task.id, task.name)));
        results.push(result);
        printResult(result, false);
        await saveResults([result], domainDir, modelId, domainName);
      }
      printSummary(results, modelId, domainName);
    }
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
    // console.log("\n--- opencode output ---");
    // console.log(r.output.trim());
    // console.log("-".repeat(60));
  }
}

function printSummary(results: TaskRunResult[], modelId: string, domainName: string) {
  const pass = results.filter(r => r.status === "pass").length;
  const partial = results.filter(r => r.status === "partial").length;
  const fail = results.filter(r => r.status === "fail").length;
  const errors = results.filter(r => r.status === "error" || r.status === "timeout").length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const totalTime = (results.reduce((s, r) => s + r.elapsedMs, 0) / 1000).toFixed(1);
  const totalIn = results.reduce((s, r) => s + (r.tokens?.inputTokens ?? 0), 0);
  const totalOut = results.reduce((s, r) => s + (r.tokens?.outputTokens ?? 0), 0);

  console.log("\n" + "=".repeat(60));
  console.log(`  SUMMARY  [${domainName}]  model=${modelId}`);
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

async function saveResults(
  results: TaskRunResult[],
  domainDir: string,
  modelName: string,
  domainName: string
) {
  // ── (a) Per-task artifact persistence ──────────────────────────────────────

  for (const r of results) {
    const taskDir = join(domainDir, taskDirName(r.taskId, r.taskName));
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

    // screenshots/ — move screenshot from cwd into the task's screenshots/ folder.
    // Primary: the filename the task config told the agent to use (screenshotPath).
    // Fallback: legacy hardcoded names from older task definitions.
    const LEGACY_SHOTS = ["eval-minecraft.png", "eval-form-result.png", "eval-screenshot.png"];
    const shotsToCheck = r.screenshotPath
      ? [r.screenshotPath, ...LEGACY_SHOTS.filter(s => s !== r.screenshotPath)]
      : LEGACY_SHOTS;

    for (const shot of shotsToCheck) {
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
    const errorsDir = join(domainDir, "errors");
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

  // ── (c) summary.json — domain-level summary ────────────────────────────────

  const summaryPath = join(domainDir, "summary.json");

  // Serialize the current batch of results
  const newEntries = results.map(r => ({
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
          inferredErrorCategory: r.telemetry.inferredErrorCategory,
          timeoutDetected: r.telemetry.timeoutDetected,
          errorDetected: r.telemetry.errorDetected,
        }
      : null,
  }));

  // Merge with existing summary: keep tasks not in this run, replace/append new ones
  let existingEntries: typeof newEntries = [];
  if (existsSync(summaryPath)) {
    try {
      const existing = JSON.parse(await Bun.file(summaryPath).text());
      existingEntries = existing.results ?? [];
    } catch {
      /* ignore corrupt or missing file */
    }
  }

  const newIds = new Set(newEntries.map(e => e.id));
  const mergedEntries = [...existingEntries.filter(e => !newIds.has(e.id)), ...newEntries];

  const summary = {
    runAt: new Date().toISOString(),
    model: modelName,
    domain: domainName,
    runDir: domainDir,
    results: mergedEntries,
    // Recomputed from the full merged set so it always reflects all known tasks
    analysis: aggregateRun(mergedEntries as TaskResultForAggregation[]),
  };

  await Bun.write(summaryPath, JSON.stringify(summary, null, 2));

  // ── Console output ─────────────────────────────────────────────────────────

  console.log(`\nResults saved to ${domainDir}/`);
  console.log(`  summary.json`);
  console.log(`  <taskId>_<slug>/agent-output.jsonl (per task)`);
  console.log(`  <taskId>_<slug>/judge/ (context + attempt artifacts)`);
  if (judgeErrors.length > 0) {
    console.log(`  errors/ (${judgeErrors.length} judge failure(s))`);
  }
}
