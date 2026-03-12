/**
 * Task Telemetry Extractor
 *
 * Extracts error signals from the agent's raw stdout WITHOUT requiring a
 * separate LLM call. Uses heuristic text analysis on the captured output.
 *
 * Thrash/redundancy analysis is performed by the judge (via observedSteps and
 * redundantCommands in judge output). Tool call counts use countToolCalls()
 * which parses structured JSONL events deterministically.
 */

import type { ErrorCategory } from "./judge/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelemetryResult {
  /** Whether a timeout was detected in the output */
  timeoutDetected: boolean;
  /** Whether an error/exception pattern was detected in the output */
  errorDetected: boolean;
  /**
   * Heuristic error category inferred from output text.
   * This supplements (but does not override) the judge's errorCategory.
   */
  inferredErrorCategory: ErrorCategory;
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
 */
export function extractTelemetry(agentOutput: string): TelemetryResult {
  // ── Error / timeout detection ─────────────────────────────────────────────
  const timeoutDetected = TIMEOUT_PATTERNS.some(p => p.test(agentOutput));
  const errorDetected = ERROR_PATTERNS.some(p => p.test(agentOutput));

  // ── Error category inference ──────────────────────────────────────────────
  let inferredErrorCategory: ErrorCategory = "none";

  if (timeoutDetected || RESOURCE_PATTERNS.some(p => p.test(agentOutput))) {
    inferredErrorCategory = "resource";
  } else if (NAVIGATION_PATTERNS.some(p => p.test(agentOutput))) {
    inferredErrorCategory = "navigation";
  } else if (COMPREHENSION_PATTERNS.some(p => p.test(agentOutput))) {
    inferredErrorCategory = "comprehension";
  } else if (errorDetected) {
    inferredErrorCategory = "execution";
  }

  return {
    timeoutDetected,
    errorDetected,
    inferredErrorCategory,
  };
}

/**
 * Count tool calls from structured JSONL events in agent output.
 *
 * Counts events where `type === "tool_use"` in the JSONL stream.
 * This is the deterministic structural count, used instead of heuristic
 * command pattern matching.
 *
 * @param rawOutput  Full raw JSONL stdout from the agent run
 * @returns Number of tool_use events found
 */
export function countToolCalls(rawOutput: string): number {
  const lines = rawOutput.split("\n");
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event && typeof event === "object" && event.type === "tool_use") {
        count++;
      }
    } catch {
      // Skip non-JSON lines
    }
  }
  return count;
}
