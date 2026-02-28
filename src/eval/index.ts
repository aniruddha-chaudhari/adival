/**
 * Task Evaluation Framework
 *
 * A framework for evaluating AI agents on structured tasks.
 * Import from this file for all eval functionality.
 *
 * Usage:
 *   import { TaskRunner, MockAgent, sampleEvalSuite } from "./src/eval";
 *   import { opencodeRun, opencodeRunWithTiming } from "./src/eval";
 */

// ── Types ──────────────────────────────────────────────────────────────────
export type {
    TaskDefinition,
    TaskCategory,
    InitialState,
    Cookie,
    SuccessCriteria,
    DOMCheck,
    SubGoal,
    SubGoalVerification,
    TaskLimits,
    BrowserState,
    AgentAction,
    ActionType,
    ExecutionMetrics,
    SubGoalResult,
    VerificationResult,
    TaskResult,
    EvalSuite,
    EvalRun,
    EvalSummary,
    FailureMode,
    FailureModeType,
    EvalConfig,
    AgentInterface,
    AgentTask,
    AgentResponse,
} from "./types";

// ── Verification ───────────────────────────────────────────────────────────
export {
    verifyTaskCompletion,
    registerCustomVerification,
    runCustomVerification,
    calculatePartialScore,
    categorizeFailure,
} from "./verification";

// ── Metrics ────────────────────────────────────────────────────────────────
export {
    MetricsCollector,
    aggregateResults,
    formatSummary,
    formatTaskResult,
    exportResultsJSON,
} from "./metrics";

// ── Runner ─────────────────────────────────────────────────────────────────
export {
    runTask,
    runAllTasks,
    type TaskRunResult,
} from "./runner";

// ── Tasks ──────────────────────────────────────────────────────────────────
export {
    flightSearchTask,
    productSearchTask,
    formFillingTask,
    dataExtractionTask,
    multiStepNavigationTask,
    sampleEvalSuite,
    registerTask,
    getTask,
    getAllTasks,
    getTasksByCategory,
} from "./tasks/index";

// ── OpenCode Runner ────────────────────────────────────────────────────────
export {
    opencodeRun,
    opencodeRunWithTiming,
    opencodeRunMultiModel,
    opencodeRunWithTokens,
} from "./opencode-run";

// ── Token Usage ────────────────────────────────────────────────────────────
export {
    listSessions,
    getLatestSessionId,
    exportSession,
    getSessionTokens,
    getLatestSessionTokens,
    getSessionTokensSince,
    type TokenUsage,
} from "./opencode-tokens";
