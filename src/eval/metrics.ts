/**
 * Metrics Collection - Track and aggregate evaluation metrics
 */

import type {
    ExecutionMetrics,
    TaskResult,
    EvalSummary,
    FailureMode,
    FailureModeType,
    AgentAction,
} from "./types";

// ============================================
// METRICS COLLECTOR CLASS
// ============================================

export class MetricsCollector {
    private startTime: number = 0;
    private actions: AgentAction[] = [];
    private llmCalls: number = 0;
    private inputTokens: number = 0;
    private outputTokens: number = 0;
    private screenshots: number = 0;

    start(): void {
        this.startTime = Date.now();
        this.reset();
    }

    reset(): void {
        this.actions = [];
        this.llmCalls = 0;
        this.inputTokens = 0;
        this.outputTokens = 0;
        this.screenshots = 0;
    }

    recordAction(action: AgentAction): void {
        this.actions.push(action);
    }

    recordLLMCall(inputTokens: number, outputTokens: number): void {
        this.llmCalls++;
        this.inputTokens += inputTokens;
        this.outputTokens += outputTokens;
    }

    recordScreenshot(): void {
        this.screenshots++;
    }

    getMetrics(): ExecutionMetrics {
        const endTime = Date.now();
        const successfulActions = this.actions.filter((a) => a.success).length;

        return {
            totalActions: this.actions.length,
            successfulActions,
            failedActions: this.actions.length - successfulActions,
            executionTimeMs: endTime - this.startTime,
            llmApiCalls: this.llmCalls,
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            totalTokens: this.inputTokens + this.outputTokens,
            screenshotCount: this.screenshots,
        };
    }

    getActions(): AgentAction[] {
        return [...this.actions];
    }

    getElapsedMs(): number {
        return Date.now() - this.startTime;
    }
}

// ============================================
// SUMMARY AGGREGATION
// ============================================

export function aggregateResults(results: TaskResult[]): EvalSummary {
    const totalTasks = results.length;

    if (totalTasks === 0) {
        return createEmptySummary();
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const partialCount = results.filter((r) => r.status === "partial").length;
    const failedCount = results.filter(
        (r) => r.status === "failed" || r.status === "timeout" || r.status === "error"
    ).length;

    const successRate = (successCount / totalTasks) * 100;

    const averagePartialScore =
        results.reduce((sum, r) => sum + r.verification.partialScore, 0) / totalTasks;

    const averageExecutionTimeMs =
        results.reduce((sum, r) => sum + r.metrics.executionTimeMs, 0) / totalTasks;

    const averageActions =
        results.reduce((sum, r) => sum + r.metrics.totalActions, 0) / totalTasks;

    const totalLLMCalls = results.reduce(
        (sum, r) => sum + r.metrics.llmApiCalls,
        0
    );

    const totalTokens = results.reduce(
        (sum, r) => sum + r.metrics.totalTokens,
        0
    );

    const failureModes = analyzeFailureModes(results);

    return {
        totalTasks,
        successCount,
        partialCount,
        failedCount,
        successRate: Math.round(successRate * 100) / 100,
        averagePartialScore: Math.round(averagePartialScore * 100) / 100,
        averageExecutionTimeMs: Math.round(averageExecutionTimeMs),
        averageActions: Math.round(averageActions * 100) / 100,
        totalLLMCalls,
        totalTokens,
        failureModes,
    };
}

function createEmptySummary(): EvalSummary {
    return {
        totalTasks: 0,
        successCount: 0,
        partialCount: 0,
        failedCount: 0,
        successRate: 0,
        averagePartialScore: 0,
        averageExecutionTimeMs: 0,
        averageActions: 0,
        totalLLMCalls: 0,
        totalTokens: 0,
        failureModes: [],
    };
}

// ============================================
// FAILURE MODE ANALYSIS
// ============================================

function analyzeFailureModes(results: TaskResult[]): FailureMode[] {
    const failedResults = results.filter((r) => r.status !== "success");
    const modeMap = new Map<FailureModeType, string[]>();

    for (const result of failedResults) {
        const mode = categorizeFailureMode(result);
        const existing = modeMap.get(mode) || [];
        existing.push(result.taskId);
        modeMap.set(mode, existing);
    }

    return Array.from(modeMap.entries())
        .map(([type, taskIds]) => ({
            type,
            count: taskIds.length,
            taskIds,
        }))
        .sort((a, b) => b.count - a.count);
}

function categorizeFailureMode(result: TaskResult): FailureModeType {
    if (result.status === "timeout") {
        return "timeout";
    }

    const errors = result.errorLog.join(" ").toLowerCase();

    if (errors.includes("element not found") || errors.includes("selector")) {
        return "element_not_found";
    }

    if (errors.includes("navigation") || errors.includes("page load")) {
        return "navigation_error";
    }

    if (errors.includes("rate limit") || errors.includes("429")) {
        return "rate_limited";
    }

    if (result.status === "error") {
        return "exception";
    }

    if (result.verification.partialScore > 0) {
        return "verification_failed";
    }

    if (result.metrics.totalActions > 0) {
        return "incorrect_action";
    }

    return "unknown";
}

// ============================================
// REPORTING UTILITIES
// ============================================

export function formatSummary(summary: EvalSummary): string {
    const lines = [
        "═══════════════════════════════════════════════════════",
        "                  EVALUATION SUMMARY                    ",
        "═══════════════════════════════════════════════════════",
        "",
        `  Total Tasks:         ${summary.totalTasks}`,
        `  Success:             ${summary.successCount} (${summary.successRate.toFixed(1)}%)`,
        `  Partial:             ${summary.partialCount}`,
        `  Failed:              ${summary.failedCount}`,
        "",
        "───────────────────────────────────────────────────────",
        "                    PERFORMANCE                         ",
        "───────────────────────────────────────────────────────",
        "",
        `  Average Score:       ${summary.averagePartialScore.toFixed(1)}%`,
        `  Avg Execution Time:  ${formatDuration(summary.averageExecutionTimeMs)}`,
        `  Avg Actions/Task:    ${summary.averageActions.toFixed(1)}`,
        "",
        "───────────────────────────────────────────────────────",
        "                    TOKEN USAGE                         ",
        "───────────────────────────────────────────────────────",
        "",
        `  Total LLM Calls:     ${summary.totalLLMCalls}`,
        `  Total Tokens:        ${summary.totalTokens.toLocaleString()}`,
        `  Avg Tokens/Task:     ${Math.round(summary.totalTokens / Math.max(1, summary.totalTasks)).toLocaleString()}`,
    ];

    if (summary.failureModes.length > 0) {
        lines.push("");
        lines.push("───────────────────────────────────────────────────────");
        lines.push("                   FAILURE ANALYSIS                     ");
        lines.push("───────────────────────────────────────────────────────");
        lines.push("");

        for (const mode of summary.failureModes) {
            lines.push(`  ${mode.type}: ${mode.count} (${mode.taskIds.join(", ")})`);
        }
    }

    lines.push("");
    lines.push("═══════════════════════════════════════════════════════");

    return lines.join("\n");
}

export function formatTaskResult(result: TaskResult): string {
    const statusIcon =
        result.status === "success"
            ? "[OK]"
            : result.status === "partial"
                ? "[~~]"
                : "[!!]";

    const lines = [
        `${statusIcon} ${result.taskName} (${result.taskId})`,
        `   Status: ${result.status.toUpperCase()}`,
        `   Score: ${result.verification.partialScore}%`,
        `   Actions: ${result.metrics.totalActions}`,
        `   Time: ${formatDuration(result.metrics.executionTimeMs)}`,
        `   Tokens: ${result.metrics.totalTokens.toLocaleString()}`,
    ];

    if (result.errorLog.length > 0) {
        lines.push(`   Errors: ${result.errorLog.slice(0, 2).join("; ")}`);
    }

    return lines.join("\n");
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const seconds = ms / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

// ============================================
// JSON EXPORT
// ============================================

export function exportResultsJSON(
    results: TaskResult[],
    summary: EvalSummary
): string {
    return JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            summary,
            results: results.map((r) => ({
                taskId: r.taskId,
                taskName: r.taskName,
                status: r.status,
                score: r.verification.partialScore,
                taskCompleted: r.verification.taskCompleted,
                subGoals: r.verification.subGoalResults,
                metrics: r.metrics,
                errors: r.errorLog,
                finalUrl: r.verification.finalUrl,
            })),
        },
        null,
        2
    );
}
