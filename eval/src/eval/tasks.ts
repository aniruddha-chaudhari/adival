/**
 * Eval Task Definitions — Loaded from eval-config.json
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";

// ─── Scorer helpers ──────────────────────────────────────────────────────────

/** Score 100 if ALL keywords appear in output (case-insensitive), else 0. */
export function keywords(...words: string[]): Scorer {
    return (output) => {
        const lower = output.toLowerCase();
        const matched = words.filter((w) => lower.includes(w.toLowerCase()));
        return Math.round((matched.length / words.length) * 100);
    };
}

/** Score 100 if pattern matches output, else 0. */
export function regex(pattern: RegExp): Scorer {
    return (output) => (pattern.test(output) ? 100 : 0);
}

/** Score = average of all scorers. */
export function allOf(...scorers: Scorer[]): Scorer {
    return (output) => {
        const scores = scorers.map((s) => s(output));
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    };
}

/** Score = max of any scorer (passes if any one passes). */
export function anyOf(...scorers: Scorer[]): Scorer {
    return (output) => Math.max(...scorers.map((s) => s(output)));
}

export type Scorer = (output: string) => number; // 0–100

export type JsonScorer = {
  type: "keywords" | "regex" | "allOf" | "anyOf";
  params: any;
};

export function parseScorer(json: JsonScorer): Scorer {
  switch (json.type) {
    case "keywords":
      return keywords(...json.params.words);
    case "regex":
      return regex(new RegExp(json.params.pattern));
    case "allOf":
      return allOf(...json.params.scorers.map(parseScorer));
    case "anyOf":
      return anyOf(...json.params.scorers.map(parseScorer));
    default:
      throw new Error(`Unknown scorer type: ${json.type}`);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvalTask {
    id: string;
    name: string;
    category: "browser" | "coding" | "data-extraction" | "navigation" | "form";
    /** Full prompt sent to `opencode run` */
    prompt: string;
    /** Optional model override (e.g. "google/antigravity-gemini-3-flash") */
    model?: string;
    /** Time limit in seconds (default 120) */
    timeoutSeconds?: number;
    /** Fast keyword/regex scorer — always runs, 0–100 */
    scorer: Scorer;
    /**
     * If true, also run LLM-as-judge after the keyword scorer.
     * The judge receives the full agent output text + screenshot (if available).
     * Final score = average of keyword score and judge score.
     */
    llmJudge?: boolean;
    /**
     * Filename the agent is instructed to save a screenshot to.
     * Passed to the LLM judge so it can open and inspect the image.
     * Example: "eval-screenshot.png"
     */
    screenshotPath?: string;
    /**
     * Optional human baseline step count for this task.
     * Used by the judge engine to compute an overhead ratio comparison.
     * Set in eval-config.json as a placeholder; populate with real data later.
     */
    humanBaselineSteps?: number;
}

// ─── Loading from JSON ───────────────────────────────────────────────────────

export interface EvalConfig {
  defaultModel: string;
  tasks: Array<{
    id: string;
    name: string;
    category: string;
    prompt: string;
    timeoutSeconds?: number;
    scorer: JsonScorer;
    llmJudge?: boolean;
    screenshotPath?: string;
    model?: string; // Optional per-task override
    /**
     * Human baseline steps placeholder. Populate to enable overhead ratio
     * comparisons in efficiency analysis. Leave undefined to skip.
     */
    humanBaselineSteps?: number;
  }>;
}

let loadedTasks: EvalTask[] | null = null;
let loadedDefaultModel: string | null = null;

export async function loadEvalConfig(): Promise<{ defaultModel: string; tasks: EvalTask[] }> {
  if (loadedTasks && loadedDefaultModel) return { defaultModel: loadedDefaultModel, tasks: loadedTasks };

  // Resolve config path relative to this file (eval/src/eval/ -> eval/)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = join(__dirname, "..", "..", "eval-config.json");
  const configText = await Bun.file(configPath).text();
  const config: EvalConfig = JSON.parse(configText);

  const tasks: EvalTask[] = config.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category as any,
    prompt: t.prompt,
    model: t.model || config.defaultModel,
    timeoutSeconds: t.timeoutSeconds,
    scorer: parseScorer(t.scorer),
    llmJudge: t.llmJudge,
    screenshotPath: t.screenshotPath,
    humanBaselineSteps: t.humanBaselineSteps,
  }));

  loadedTasks = tasks;
  loadedDefaultModel = config.defaultModel;
  return { defaultModel: config.defaultModel, tasks };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ALL_TASKS: EvalTask[] = []; // Placeholder, use getAllTasks()
export async function getAllTasks(): Promise<EvalTask[]> {
  const { tasks } = await loadEvalConfig();
  return tasks;
}

export async function getTaskById(id: string): Promise<EvalTask | undefined> {
  const tasks = await getAllTasks();
  return tasks.find((t) => t.id === id);
}
