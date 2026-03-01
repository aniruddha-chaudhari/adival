/**
 * Task Telemetry Extractor
 *
 * Extracts step/command metrics from the agent's raw stdout WITHOUT requiring
 * a separate LLM call. Uses heuristic text analysis on the captured output.
 *
 * This is a lightweight Phase 2 implementation. The agent-browser skill outputs
 * structured lines like:
 *   > agent-browser navigate ...
 *   > agent-browser snapshot
 *   > agent-browser click ...
 *   Bash: opencode run ...
 *
 * We count these to infer trajectoryLength, redundantCommands, and error signals
 * independently of the judge's self-reported observedSteps.
 *
 * Why not rely solely on the judge's observedSteps?
 *   The judge estimates from the *description* of the output. Direct text parsing
 *   is more objective and catches cases where the judge over/under-counts.
 *   Both sources are preserved in the analysis; discrepancies flag low-confidence runs.
 */

import type { ErrorCategory } from "./judge/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelemetryResult {
  /** Total distinct tool/command invocations detected in stdout */
  observedCommands: number;
  /** Commands that appear to be exact or near-exact repeats */
  redundantCommandCount: number;
  /** Thrash ratio: redundantCommandCount / observedCommands (null if 0 commands) */
  thrashRatio: number | null;
  /** Whether a timeout was detected in the output */
  timeoutDetected: boolean;
  /** Whether an error/exception pattern was detected in the output */
  errorDetected: boolean;
  /**
   * Heuristic error category inferred from output text.
   * This supplements (but does not override) the judge's errorCategory.
   */
  inferredErrorCategory: ErrorCategory;
  /** Raw command strings extracted from the output */
  extractedCommands: string[];
}

// ─── Command detection patterns ───────────────────────────────────────────────

/** Patterns that indicate a tool/command invocation in agent stdout */
const COMMAND_PATTERNS: RegExp[] = [
  // agent-browser CLI calls
  /^\s*(?:>\s*)?agent-browser\s+\S+/im,
  // Bash tool invocations (opencode output shows these)
  /^\s*Bash(?:\s*tool)?\s*:/im,
  /^\s*Running:\s+/im,
  // opencode tool use markers
  /^\s*Tool\s+(?:call|use)\s*:/im,
  /^\s*\[tool_use\]/im,
  // Common CLI patterns in captured output
  /^\s*\$\s+\S+/im,
];

/** Per-line detection: returns a canonical command string or null */
function detectCommand(line: string): string | null {
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.test(line)) {
      // Normalize: lowercase, strip leading punctuation, truncate
      return line
        .trim()
        .replace(/^[>\$\s]+/, "")
        .slice(0, 120)
        .toLowerCase();
    }
  }
  return null;
}

// ─── Error / timeout patterns ─────────────────────────────────────────────────

const TIMEOUT_PATTERNS = [/timed?\s*out/i, /timeout/i, /deadline exceeded/i, /ETIMEDOUT/];

const ERROR_PATTERNS = [
  /error:/i,
  /exception:/i,
  /failed to/i,
  /could not/i,
  /unable to/i,
  /not found/i,
  /no such/i,
  /crashed/i,
  /fatal/i,
];

const NAVIGATION_PATTERNS = [
  /wrong url/i,
  /navigated to.*instead/i,
  /404/,
  /page not found/i,
  /couldn't navigate/i,
];

const RESOURCE_PATTERNS = [
  /failed to load/i,
  /connection refused/i,
  /ECONNREFUSED/,
  /network error/i,
  /dns.*fail/i,
  /element not found/i,
  /selector.*not.*found/i,
  /no element/i,
];

const COMPREHENSION_PATTERNS = [/misunderstood/i, /wrong task/i, /not what.*asked/i];

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Extract telemetry from raw agent stdout.
 *
 * This is purely heuristic and fast (no subprocess calls).
 * Results are stored in TaskRunResult.analysis for Phase 2+ use.
 */
export function extractTelemetry(agentOutput: string): TelemetryResult {
  const lines = agentOutput.split("\n");

  // ── Command extraction ────────────────────────────────────────────────────
  const allCommands: string[] = [];
  for (const line of lines) {
    const cmd = detectCommand(line);
    if (cmd) allCommands.push(cmd);
  }

  // ── Redundancy detection ──────────────────────────────────────────────────
  const commandCounts = new Map<string, number>();
  for (const cmd of allCommands) {
    commandCounts.set(cmd, (commandCounts.get(cmd) ?? 0) + 1);
  }

  // A command is redundant every time it appears beyond the first
  let redundantCommandCount = 0;
  for (const count of commandCounts.values()) {
    if (count > 1) redundantCommandCount += count - 1;
  }

  const observedCommands = allCommands.length;
  const thrashRatio =
    observedCommands > 0 ? Math.min(1, redundantCommandCount / observedCommands) : null;

  // ── Error / timeout detection ─────────────────────────────────────────────
  const outputLower = agentOutput;

  const timeoutDetected = TIMEOUT_PATTERNS.some(p => p.test(outputLower));
  const errorDetected = ERROR_PATTERNS.some(p => p.test(outputLower));

  // ── Error category inference ──────────────────────────────────────────────
  let inferredErrorCategory: ErrorCategory = "none";

  if (timeoutDetected || RESOURCE_PATTERNS.some(p => p.test(outputLower))) {
    inferredErrorCategory = "resource";
  } else if (NAVIGATION_PATTERNS.some(p => p.test(outputLower))) {
    inferredErrorCategory = "navigation";
  } else if (COMPREHENSION_PATTERNS.some(p => p.test(outputLower))) {
    inferredErrorCategory = "comprehension";
  } else if (errorDetected) {
    inferredErrorCategory = "execution";
  }

  return {
    observedCommands,
    redundantCommandCount,
    thrashRatio,
    timeoutDetected,
    errorDetected,
    inferredErrorCategory,
    extractedCommands: allCommands,
  };
}
