/**
 * Judge Output Schema
 *
 * Strict JSON contract that the judge agent must produce.
 * Every field is required; the parser will reject or fallback on any violation.
 */

export type JudgeVerdict = "PASS" | "PARTIAL" | "FAIL";

export type ErrorCategory = "none" | "comprehension" | "execution" | "resource" | "navigation";

/**
 * Raw JSON object the judge agent is expected to emit.
 * Mirrors the schema in .opencode/agents/judge.md exactly.
 */
export interface JudgeRawOutput {
  verdict: JudgeVerdict;
  /** 0–100 completion score */
  completionScore: number;
  /** One sentence, max 120 chars */
  rationale: string;
  errorCategory: ErrorCategory;
  /** 0–100 safety score (100 = fully safe) */
  safetyScore: number;
  harmfulAttempted: boolean;
  constraintCompliance: boolean;
  /** Specific risky actions observed; empty array if none */
  riskyActions: string[];
  /** Tool calls / actions not needed to complete the task */
  unnecessarySteps: number;
  /** Exact or near-exact duplicate commands */
  redundantCommands: number;
  /** Total distinct tool calls inferred from agent output */
  observedSteps: number;
}

// ─── Judge attempt tracking ──────────────────────────────────────────────────

/**
 * Result of a single judge attempt (provider call + parse).
 * Two of these are produced per task (attempt_1, attempt_2).
 */
export interface JudgeAttemptResult {
  /** Full raw subprocess stdout (JSONL stream) */
  rawStdout: string;
  /** Extracted assistant text from JSONL events */
  assistantText: string;
  /** Parsed judge output (null if provider errored before parsing) */
  parsedOutput: import("./parsers").ParseResult | null;
  /** Provider-level error (timeout, spawn failure, etc.) — null on success */
  error: string | null;
  /** Process exit code (null if provider errored before exit) */
  exitCode: number | null;
}

/**
 * Mismatch detection between two valid judge attempts.
 * Recorded when both attempts succeed but key numeric fields differ.
 */
export interface JudgeMismatch {
  /** Whether any numeric fields differed between attempts */
  detected: boolean;
  /** Names of fields that differed */
  fields: string[];
}

/** Numeric fields compared for mismatch detection between judge attempts */
export const MISMATCH_FIELDS = [
  "completionScore",
  "safetyScore",
  "observedSteps",
  "unnecessarySteps",
  "redundantCommands",
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_VERDICTS = new Set<string>(["PASS", "PARTIAL", "FAIL"]);
const VALID_ERROR_CATEGORIES = new Set<string>([
  "none",
  "comprehension",
  "execution",
  "resource",
  "navigation",
]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a parsed object against the JudgeRawOutput contract.
 * Returns `valid: true` plus an empty errors array on success.
 */
export function validateJudgeOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ["Root value is not an object"] };
  }

  const o = obj as Record<string, unknown>;

  // verdict
  if (typeof o.verdict !== "string" || !VALID_VERDICTS.has(o.verdict)) {
    errors.push(`verdict must be "PASS"|"PARTIAL"|"FAIL", got ${JSON.stringify(o.verdict)}`);
  }

  // completionScore
  if (typeof o.completionScore !== "number" || o.completionScore < 0 || o.completionScore > 100) {
    errors.push(`completionScore must be integer 0-100, got ${JSON.stringify(o.completionScore)}`);
  }

  // rationale
  if (typeof o.rationale !== "string" || o.rationale.trim().length === 0) {
    errors.push(`rationale must be a non-empty string`);
  }

  // errorCategory
  if (typeof o.errorCategory !== "string" || !VALID_ERROR_CATEGORIES.has(o.errorCategory)) {
    errors.push(
      `errorCategory must be one of ${[...VALID_ERROR_CATEGORIES].join("|")}, got ${JSON.stringify(o.errorCategory)}`
    );
  }

  // safetyScore
  if (typeof o.safetyScore !== "number" || o.safetyScore < 0 || o.safetyScore > 100) {
    errors.push(`safetyScore must be integer 0-100, got ${JSON.stringify(o.safetyScore)}`);
  }

  // harmfulAttempted
  if (typeof o.harmfulAttempted !== "boolean") {
    errors.push(`harmfulAttempted must be boolean`);
  }

  // constraintCompliance
  if (typeof o.constraintCompliance !== "boolean") {
    errors.push(`constraintCompliance must be boolean`);
  }

  // riskyActions
  if (!Array.isArray(o.riskyActions) || !o.riskyActions.every(x => typeof x === "string")) {
    errors.push(`riskyActions must be string[]`);
  }

  // unnecessarySteps
  if (typeof o.unnecessarySteps !== "number" || o.unnecessarySteps < 0) {
    errors.push(`unnecessarySteps must be non-negative integer`);
  }

  // redundantCommands
  if (typeof o.redundantCommands !== "number" || o.redundantCommands < 0) {
    errors.push(`redundantCommands must be non-negative integer`);
  }

  // observedSteps
  if (typeof o.observedSteps !== "number" || o.observedSteps < 1) {
    errors.push(`observedSteps must be integer >= 1`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Coerce a loosely-typed parsed object into a valid JudgeRawOutput.
 * Fills in safe defaults for any missing or invalid fields so the pipeline
 * can continue even when the model omits optional fields.
 */
export function coerceJudgeOutput(obj: Record<string, unknown>): JudgeRawOutput {
  const verdict = VALID_VERDICTS.has(String(obj.verdict ?? ""))
    ? (obj.verdict as JudgeVerdict)
    : "FAIL";

  const completionScore =
    typeof obj.completionScore === "number" &&
    obj.completionScore >= 0 &&
    obj.completionScore <= 100
      ? Math.round(obj.completionScore)
      : verdict === "PASS"
        ? 100
        : verdict === "PARTIAL"
          ? 50
          : 0;

  const rationale =
    typeof obj.rationale === "string" && obj.rationale.trim().length > 0
      ? obj.rationale.trim().slice(0, 200)
      : "No rationale provided.";

  const errorCategory = VALID_ERROR_CATEGORIES.has(String(obj.errorCategory ?? ""))
    ? (obj.errorCategory as ErrorCategory)
    : "none";

  const safetyScore =
    typeof obj.safetyScore === "number" && obj.safetyScore >= 0 && obj.safetyScore <= 100
      ? Math.round(obj.safetyScore)
      : 100;

  const harmfulAttempted = typeof obj.harmfulAttempted === "boolean" ? obj.harmfulAttempted : false;

  const constraintCompliance =
    typeof obj.constraintCompliance === "boolean" ? obj.constraintCompliance : true;

  const riskyActions =
    Array.isArray(obj.riskyActions) && obj.riskyActions.every(x => typeof x === "string")
      ? (obj.riskyActions as string[])
      : [];

  const unnecessarySteps =
    typeof obj.unnecessarySteps === "number" && obj.unnecessarySteps >= 0
      ? Math.round(obj.unnecessarySteps)
      : 0;

  const redundantCommands =
    typeof obj.redundantCommands === "number" && obj.redundantCommands >= 0
      ? Math.round(obj.redundantCommands)
      : 0;

  const observedSteps =
    typeof obj.observedSteps === "number" && obj.observedSteps >= 1
      ? Math.round(obj.observedSteps)
      : 1;

  return {
    verdict,
    completionScore,
    rationale,
    errorCategory,
    safetyScore,
    harmfulAttempted,
    constraintCompliance,
    riskyActions,
    unnecessarySteps,
    redundantCommands,
    observedSteps,
  };
}
