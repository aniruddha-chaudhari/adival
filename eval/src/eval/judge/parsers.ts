/**
 * Judge Output Parsers
 *
 * Two-layer parsing strategy:
 *
 * 1. Primary: strict JSON.parse() on the raw text from the judge agent.
 *    The agent is prompted to output a bare JSON object with no markdown fencing.
 *
 * 2. Fallback: extract the first {...} block from the raw text using a regex,
 *    then JSON.parse() that. Handles cases where the model adds prose around
 *    the JSON despite instructions.
 *
 * Both paths validate the parsed object and return coerced output + debug info.
 */

import { type JudgeRawOutput, validateJudgeOutput, coerceJudgeOutput } from "./schema";

export interface ParseResult {
  output: JudgeRawOutput;
  /** Which strategy succeeded */
  strategy: "strict" | "fallback" | "default";
  /** Raw text received from the provider */
  rawText: string;
  /** Any parse/validation errors encountered (informational) */
  parseErrors: string[];
}

/**
 * Parse raw judge agent text into a validated JudgeRawOutput.
 *
 * Never throws — always returns a ParseResult with a safe default on total failure.
 */
export function parseJudgeOutput(rawText: string): ParseResult {
  const parseErrors: string[] = [];

  // ── Strategy 1: strict JSON.parse on the trimmed raw text ────────────────
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const validation = validateJudgeOutput(parsed);
      if (validation.valid) {
        return {
          output: coerceJudgeOutput(parsed as Record<string, unknown>),
          strategy: "strict",
          rawText,
          parseErrors: [],
        };
      }
      // Object parsed but schema invalid — record errors, still try coercion
      parseErrors.push(...validation.errors.map(e => `[strict] validation: ${e}`));
      return {
        output: coerceJudgeOutput(parsed as Record<string, unknown>),
        strategy: "strict",
        rawText,
        parseErrors,
      };
    } catch (err) {
      parseErrors.push(
        `[strict] JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    parseErrors.push(`[strict] raw text does not start with '{', skipping strict parse`);
  }

  // ── Strategy 2: extract first {...} block ─────────────────────────────────
  // Handle nested braces by finding the matching close
  const firstBrace = rawText.indexOf("{");
  if (firstBrace !== -1) {
    const jsonCandidate = extractJsonObject(rawText, firstBrace);
    if (jsonCandidate !== null) {
      try {
        const parsed = JSON.parse(jsonCandidate);
        const validation = validateJudgeOutput(parsed);
        if (validation.valid) {
          return {
            output: coerceJudgeOutput(parsed as Record<string, unknown>),
            strategy: "fallback",
            rawText,
            parseErrors,
          };
        }
        parseErrors.push(...validation.errors.map(e => `[fallback] validation: ${e}`));
        return {
          output: coerceJudgeOutput(parsed as Record<string, unknown>),
          strategy: "fallback",
          rawText,
          parseErrors,
        };
      } catch (err) {
        parseErrors.push(
          `[fallback] JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      parseErrors.push(`[fallback] could not extract balanced JSON object from raw text`);
    }
  } else {
    parseErrors.push(`[fallback] no '{' found in raw text`);
  }

  // ── Strategy 3: legacy VERDICT:/REASON: regex (last resort) ──────────────
  const legacyResult = parseLegacyFormat(rawText);
  if (legacyResult) {
    parseErrors.push(`[default] using legacy VERDICT:/REASON: regex fallback`);
    return {
      output: legacyResult,
      strategy: "default",
      rawText,
      parseErrors,
    };
  }

  // ── Total failure: return safe FAIL default ───────────────────────────────
  parseErrors.push(`[default] all parse strategies failed, returning FAIL default`);
  return {
    output: {
      verdict: "FAIL",
      completionScore: 0,
      rationale: "Judge produced unparseable output.",
      errorCategory: "execution",
      safetyScore: 100,
      harmfulAttempted: false,
      constraintCompliance: true,
      riskyActions: [],
      unnecessarySteps: 0,
      redundantCommands: 0,
      observedSteps: 1,
    },
    strategy: "default",
    rawText,
    parseErrors,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a balanced JSON object starting at `startIndex` in `text`.
 * Returns null if the braces never balance.
 */
function extractJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }
  return null;
}

/**
 * Last-resort parser that handles the old VERDICT:/REASON: text format.
 * Used when the judge ignores the JSON instruction entirely.
 */
function parseLegacyFormat(raw: string): JudgeRawOutput | null {
  const verdictMatch = raw.match(/VERDICT:\s*(PASS|PARTIAL|FAIL)/i);
  if (!verdictMatch) return null;

  const verdict = verdictMatch[1].toUpperCase() as "PASS" | "PARTIAL" | "FAIL";
  const reasonMatch = raw.match(/REASON:\s*(.+)/i);
  const rationale = reasonMatch?.[1]?.trim().slice(0, 200) ?? "No rationale (legacy format).";

  const completionScore = verdict === "PASS" ? 100 : verdict === "PARTIAL" ? 50 : 0;

  return {
    verdict,
    completionScore,
    rationale,
    errorCategory: verdict === "FAIL" ? "execution" : "none",
    safetyScore: 100,
    harmfulAttempted: false,
    constraintCompliance: true,
    riskyActions: [],
    unnecessarySteps: 0,
    redundantCommands: 0,
    observedSteps: 1,
  };
}
