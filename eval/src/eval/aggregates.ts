/**
 * Run-Level Aggregates
 *
 * Computes analytics across all TaskRunResults after a full eval run.
 * Added to summary.json as a backward-compatible `analysis` block.
 *
 * Metrics computed:
 *   Efficiency: mean steps, SEM steps, success/fail step distributions
 *   Error:      failure rates per category, most common failure mode
 *   Safety:     mean safety score, harmful attempt count, constraint violation count
 *   Thrashing:  mean thrash ratio, total redundant commands, tasks with thrashing
 */

import type { ErrorCategory } from "./judge/schema";
import type { TaskAnalysis } from "./judge/rubrics";

// ─── Input: per-task analysis is embedded in TaskRunResult ───────────────────
// We accept a minimal shape so this module doesn't import runner types.

export interface TaskResultForAggregation {
  status: "pass" | "partial" | "fail" | "error" | "timeout";
  score: number;
  keywordScore: number;
  judgeScore: number | null;
  elapsedMs: number;
  /** Present when judge ran and Phase 2 analysis is active */
  analysis?: TaskAnalysis | null;
  /** Present when telemetry extraction ran */
  telemetry?: {
    observedCommands: number;
    redundantCommandCount: number;
    thrashRatio: number | null;
  } | null;
}

// ─── Output: run-level analysis blocks ───────────────────────────────────────

export interface EfficiencyAggregates {
  /** Mean observed steps across all tasks where judge ran */
  meanSteps: number | null;
  /** Standard error of the mean for steps */
  semSteps: number | null;
  /** Mean steps for tasks that passed */
  meanStepsSuccessful: number | null;
  /** Mean steps for tasks that failed */
  meanStepsFailed: number | null;
  /** Total tasks contributing to step stats */
  taskCount: number;
}

export interface ErrorAggregates {
  /** Total tasks with status === "fail" or "error" or "timeout" */
  totalFailures: number;
  /** Failure rate: totalFailures / totalTasks */
  failureRate: number;
  /** Count per error category */
  byCategory: Record<ErrorCategory, number>;
  /** The most common non-"none" error category, or null if no failures */
  mostCommonFailureMode: ErrorCategory | null;
}

export interface SafetyAggregates {
  /** Mean safety score across tasks where judge ran */
  meanSafetyScore: number | null;
  /** Number of tasks where harmfulAttempted === true */
  harmfulAttemptCount: number;
  /** Number of tasks where constraintCompliance === false */
  constraintViolationCount: number;
  /** Number of tasks where safetyFlag === true */
  safetyFlagCount: number;
}

export interface ThrashingAggregates {
  /** Mean thrash ratio across tasks with telemetry */
  meanThrashRatio: number | null;
  /** Total redundant commands across all tasks */
  totalRedundantCommands: number;
  /** Number of tasks where thrashingDetected === true */
  thrashingTaskCount: number;
}

export interface TimeAggregates {
  /** Mean elapsed time across all tasks (ms) */
  meanElapsedMs: number | null;
  /** Mean elapsed time for passed tasks only (ms) */
  meanElapsedMsPassed: number | null;
  /** Median elapsed time across all tasks (ms) */
  medianElapsedMs: number | null;
  /** Interquartile range: Q3 - Q1 (ms) */
  iqrElapsedMs: number | null;
}

export interface RunAnalysis {
  efficiency: EfficiencyAggregates;
  error: ErrorAggregates;
  safety: SafetyAggregates;
  thrashing: ThrashingAggregates;
  time: TimeAggregates;
}

// ─── Aggregation functions ────────────────────────────────────────────────────

export function aggregateRun(results: TaskResultForAggregation[]): RunAnalysis {
  return {
    efficiency: aggregateEfficiency(results),
    error: aggregateErrors(results),
    safety: aggregateSafety(results),
    thrashing: aggregateThrashing(results),
    time: aggregateTime(results),
  };
}

function aggregateEfficiency(results: TaskResultForAggregation[]): EfficiencyAggregates {
  const withSteps = results
    .filter(r => r.analysis?.efficiency != null)
    .map(r => ({
      steps: r.analysis!.efficiency.trajectoryLength,
      passed: r.status === "pass",
      failed: r.status === "fail" || r.status === "error" || r.status === "timeout",
    }));

  if (withSteps.length === 0) {
    return {
      meanSteps: null,
      semSteps: null,
      meanStepsSuccessful: null,
      meanStepsFailed: null,
      taskCount: 0,
    };
  }

  const allSteps = withSteps.map(r => r.steps);
  const mean = avg(allSteps);
  const sem = allSteps.length > 1 ? stddev(allSteps) / Math.sqrt(allSteps.length) : null;

  const successSteps = withSteps.filter(r => r.passed).map(r => r.steps);
  const failSteps = withSteps.filter(r => r.failed).map(r => r.steps);

  return {
    meanSteps: mean,
    semSteps: sem,
    meanStepsSuccessful: successSteps.length > 0 ? avg(successSteps) : null,
    meanStepsFailed: failSteps.length > 0 ? avg(failSteps) : null,
    taskCount: withSteps.length,
  };
}

function aggregateErrors(results: TaskResultForAggregation[]): ErrorAggregates {
  const total = results.length;
  const failures = results.filter(
    r => r.status === "fail" || r.status === "error" || r.status === "timeout"
  ).length;

  const byCategory: Record<ErrorCategory, number> = {
    none: 0,
    comprehension: 0,
    execution: 0,
    resource: 0,
    navigation: 0,
  };

  for (const r of results) {
    const cat = r.analysis?.error?.category ?? "none";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  // Most common non-"none" category
  let mostCommon: ErrorCategory | null = null;
  let mostCommonCount = 0;
  for (const [cat, count] of Object.entries(byCategory) as [ErrorCategory, number][]) {
    if (cat !== "none" && count > mostCommonCount) {
      mostCommon = cat;
      mostCommonCount = count;
    }
  }

  return {
    totalFailures: failures,
    failureRate: total > 0 ? failures / total : 0,
    byCategory,
    mostCommonFailureMode: mostCommon,
  };
}

function aggregateSafety(results: TaskResultForAggregation[]): SafetyAggregates {
  const withSafety = results.filter(r => r.analysis?.safety != null);

  const safetyScores = withSafety.map(r => r.analysis!.safety.safetyScore);
  const harmfulCount = withSafety.filter(r => r.analysis!.safety.harmfulAttempted).length;
  const violationCount = withSafety.filter(r => !r.analysis!.safety.constraintCompliance).length;
  const flagCount = withSafety.filter(r => r.analysis!.safety.safetyFlag).length;

  return {
    meanSafetyScore: safetyScores.length > 0 ? avg(safetyScores) : null,
    harmfulAttemptCount: harmfulCount,
    constraintViolationCount: violationCount,
    safetyFlagCount: flagCount,
  };
}

function aggregateThrashing(results: TaskResultForAggregation[]): ThrashingAggregates {
  // Use judge-derived thrashing data as source of truth
  const thrashRatios: number[] = [];
  let totalRedundant = 0;
  let thrashingTasks = 0;

  for (const r of results) {
    if (r.analysis?.thrashing != null) {
      if (r.analysis.thrashing.thrashRatio !== null) {
        thrashRatios.push(r.analysis.thrashing.thrashRatio);
      }
      totalRedundant += r.analysis.thrashing.redundantCommands;
      if (r.analysis.thrashing.thrashingDetected) thrashingTasks++;
    }
  }

  return {
    meanThrashRatio: thrashRatios.length > 0 ? avg(thrashRatios) : null,
    totalRedundantCommands: totalRedundant,
    thrashingTaskCount: thrashingTasks,
  };
}

function aggregateTime(results: TaskResultForAggregation[]): TimeAggregates {
  const allTimes = results.map(r => r.elapsedMs).filter(t => t > 0);
  const passedTimes = results
    .filter(r => r.status === "pass")
    .map(r => r.elapsedMs)
    .filter(t => t > 0);

  if (allTimes.length === 0) {
    return {
      meanElapsedMs: null,
      meanElapsedMsPassed: null,
      medianElapsedMs: null,
      iqrElapsedMs: null,
    };
  }

  const sorted = [...allTimes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];

  return {
    meanElapsedMs: round2(avg(allTimes)),
    meanElapsedMsPassed: passedTimes.length > 0 ? round2(avg(passedTimes)) : null,
    medianElapsedMs: round2(median),
    iqrElapsedMs: round2(q3 - q1),
  };
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
  return round2(Math.sqrt(variance));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
