/**
 * rejudge_web_browsing.ts
 *
 * Re-runs only the judge (attempt_1) for all web-browsing-hard domains across
 * all model result folders, using DEFAULT_MODEL as the judge regardless of
 * which model ran the original agent.
 *
 * Usage:
 *   bun run eval/src/eval/judge/rejudge_web_browsing.ts            # full run
 *   bun run eval/src/eval/judge/rejudge_web_browsing.ts --dry-run  # print plan only
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { judgeTaskWithEngine } from "./engine";
import { DEFAULT_MODEL, loadEvalConfig } from "../tasks";
import { aggregateRun } from "../aggregates";

// ─── Constants ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_ROOT = join(__dirname, "../eval-results");
const CONFIG_PATH = join(__dirname, "../tasks/eval-config-hard.json");

const DOMAINS = [
  "web-browsing-hard",
  "web-browsing-hard-pinchtab",
  "web-browsing-hard-playwright-mcp",
] as const;

const PASS_THRESHOLD = 80;
const PARTIAL_THRESHOLD = 30;

// ─── CLI ──────────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findTaskDir(domainPath: string, taskId: string): string | null {
  const entries = readdirSync(domainPath, { withFileTypes: true });
  const match = entries.find(e => e.isDirectory() && e.name.startsWith(taskId + "_"));
  return match ? join(domainPath, match.name) : null;
}

function resolveScreenshot(taskDir: string, screenshotPath?: string): string | undefined {
  if (!screenshotPath) return undefined;
  const candidate = join(taskDir, "screenshots", screenshotPath);
  return existsSync(candidate) ? candidate : undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  if (dryRun) console.log("[DRY-RUN] No LLM calls will be made.\n");

  // Load task definitions once
  const { tasks } = await loadEvalConfig(CONFIG_PATH);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Discover model dirs (skip date-stamped old folders)
  const modelDirs = readdirSync(RESULTS_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.match(/^\d{4}-/))
    .map(e => e.name);

  let totalDone = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const modelDir of modelDirs) {
    for (const domain of DOMAINS) {
      const domainPath = join(RESULTS_ROOT, modelDir, domain);
      if (!existsSync(domainPath)) continue;

      const summaryPath = join(domainPath, "summary.json");
      if (!existsSync(summaryPath)) {
        console.warn(`[WARN] No summary.json: ${modelDir}/${domain} — skipping domain`);
        continue;
      }

      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      const existingResults: Record<string, unknown>[] = summary.results ?? [];

      console.log(`\n── ${modelDir} / ${domain} ──`);

      for (const task of taskMap.values()) {
        const label = `${modelDir}/${domain}/${task.id}`;

        // Skip if no existing summary entry (agent never ran this task)
        const existingEntry = existingResults.find((r: any) => r.id === task.id) as any;
        if (!existingEntry) {
          console.warn(`[SKIP] ${label} — no summary entry`);
          totalSkipped++;
          continue;
        }

        const taskDir = findTaskDir(domainPath, task.id);
        if (!taskDir) {
          console.warn(`[SKIP] ${label} — task dir missing`);
          totalSkipped++;
          continue;
        }

        const agentOutputPath = join(taskDir, "agent-output.jsonl");
        if (!existsSync(agentOutputPath)) {
          console.warn(`[SKIP] ${label} — agent-output.jsonl missing`);
          totalSkipped++;
          continue;
        }

        if (dryRun) {
          const shot = task.screenshotPath
            ? resolveScreenshot(taskDir, task.screenshotPath)
            : undefined;
          console.log(`[DRY-RUN] ${label}  screenshot=${shot ? "yes" : "no"}`);
          continue;
        }

        console.log(`[JUDGING] ${label} ...`);

        try {
          const agentOutput = readFileSync(agentOutputPath, "utf8");
          const screenshotPath = resolveScreenshot(taskDir, task.screenshotPath);

          const engineResult = await judgeTaskWithEngine(
            task.name,
            task.prompt,
            agentOutput,
            screenshotPath,
            taskDir,
            {
              model: DEFAULT_MODEL,
              attempts: 1,
              humanBaselineSteps: task.humanBaselineSteps,
              outputFiles: task.outputFiles,
              expectedOutputFile: task.expectedOutputFile,
            }
          );

          // ── Write judge artifacts (attempt_1 only) ──────────────────────
          const judgeDir = join(taskDir, "judge");
          const attempt1Dir = join(judgeDir, "attempt_1");
          mkdirSync(attempt1Dir, { recursive: true });

          writeFileSync(join(judgeDir, "context-sent.md"), engineResult.renderedContext);
          writeFileSync(
            join(attempt1Dir, "raw-stdout.jsonl"),
            engineResult.judgeAttempts[0].rawStdout ?? ""
          );
          writeFileSync(
            join(attempt1Dir, "assistant-text.txt"),
            engineResult.judgeAttempts[0].assistantText ?? ""
          );
          writeFileSync(
            join(attempt1Dir, "parsed-output.json"),
            engineResult.judgeAttempts[0].parsedOutput
              ? JSON.stringify(engineResult.judgeAttempts[0].parsedOutput, null, 2)
              : "null"
          );

          // ── Patch summary entry ─────────────────────────────────────────
          const keywordScore = existingEntry.keywordScore ?? 0;
          const judgeScore = engineResult.score;
          const score = Math.round((keywordScore + judgeScore) / 2);
          const status =
            score >= PASS_THRESHOLD ? "pass" : score >= PARTIAL_THRESHOLD ? "partial" : "fail";

          const newEntry = {
            ...existingEntry,
            status,
            score,
            judgeScore,
            judge: {
              verdict: engineResult.verdict,
              score: engineResult.score,
              reason: engineResult.reason,
              usedScreenshot: engineResult.usedScreenshot,
            },
            judgeSelectedAttempt: engineResult.judgeSelectedAttempt,
            judgeMismatch: engineResult.judgeMismatch,
            analysis: engineResult.analysis
              ? {
                  efficiency: engineResult.analysis.efficiency,
                  error: engineResult.analysis.error,
                  safety: engineResult.analysis.safety,
                  thrashing: engineResult.analysis.thrashing,
                }
              : null,
          };

          const idx = existingResults.findIndex((r: any) => r.id === task.id);
          if (idx >= 0) existingResults[idx] = newEntry;
          else existingResults.push(newEntry);

          console.log(`[DONE]    ${label}  verdict=${engineResult.verdict}  score=${score}/100`);
          totalDone++;
        } catch (err) {
          console.error(`[FAIL]    ${label}  ${err instanceof Error ? err.message : String(err)}`);
          totalFailed++;
        }
      }

      if (!dryRun) {
        // Rewrite summary.json with patched entries + fresh aggregates
        summary.results = existingResults;
        summary.runAt = new Date().toISOString();
        summary.analysis = aggregateRun(existingResults as any);
        writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`[SAVED]   ${summaryPath}`);
      }
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (dryRun) {
    console.log("Dry-run complete. No files written.");
  } else {
    console.log(`Done.  judged=${totalDone}  skipped=${totalSkipped}  failed=${totalFailed}`);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
