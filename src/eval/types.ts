/**
 * Task Evaluation Framework - Type Definitions
 */

// ============================================
// TASK DEFINITION TYPES
// ============================================

export interface TaskDefinition {
    id: string;
    name: string;
    description: string;
    category: TaskCategory;
    instruction: string; // Natural language instruction for the agent
    startingUrl: string;
    initialState?: InitialState;
    structuredInputs?: Record<string, string | number | boolean>;
    successCriteria: SuccessCriteria;
    subGoals: SubGoal[];
    limits: TaskLimits;
    metadata?: Record<string, unknown>;
}

export type TaskCategory =
    | "navigation"
    | "form-filling"
    | "data-extraction"
    | "search-filter"
    | "authentication"
    | "e-commerce"
    | "mixed";

export interface InitialState {
    cookies?: Cookie[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    authToken?: string;
}

export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
}

export interface SuccessCriteria {
    urlPattern?: string | RegExp;
    urlContains?: string;
    domElements?: DOMCheck[];
    pageTitle?: string | RegExp;
    customVerification?: string; // Name of custom verification function
}

export interface DOMCheck {
    selector: string;
    exists?: boolean;
    text?: string | RegExp;
    attribute?: { name: string; value: string | RegExp };
    count?: number;
}

export interface SubGoal {
    id: string;
    name: string;
    description: string;
    weight: number; // Weight for partial scoring (0-1, all weights should sum to 1)
    verification: SubGoalVerification;
}

export interface SubGoalVerification {
    type: "url" | "dom" | "state" | "custom" | "llm_judge";
    urlContains?: string;
    urlPattern?: string | RegExp;
    domCheck?: DOMCheck;
    stateKey?: string;
    stateValue?: unknown;
    customFn?: string;
    judgePrompt?: string; // For LLM judge verification
}

export interface TaskLimits {
    maxActions: number;
    maxTimeSeconds: number;
    maxLLMCalls?: number;
    maxTokens?: number;
}

// ============================================
// EXECUTION & RESULT TYPES
// ============================================

export interface BrowserState {
    url: string;
    title: string;
    dom: string; // HTML content or simplified DOM
    screenshot?: string; // Base64 encoded
    cookies?: Cookie[];
    localStorage?: Record<string, string>;
    timestamp: number;
}

export interface AgentAction {
    id: string;
    type: ActionType;
    target?: string; // CSS selector or URL
    value?: string; // Input value, text to type, etc.
    timestamp: number;
    duration?: number;
    success: boolean;
    error?: string;
    reasoning?: string; // Agent's reasoning for this action
}

export type ActionType =
    | "navigate"
    | "click"
    | "type"
    | "select"
    | "scroll"
    | "hover"
    | "wait"
    | "screenshot"
    | "extract"
    | "custom";

export interface ExecutionMetrics {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    executionTimeMs: number;
    llmApiCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    screenshotCount: number;
}

export interface SubGoalResult {
    id: string;
    name: string;
    completed: boolean;
    weight: number;
    details?: string;
}

export interface VerificationResult {
    taskCompleted: boolean;
    partialScore: number; // 0-100
    subGoalResults: SubGoalResult[];
    finalUrl: string;
    matchedCriteria: string[];
    failedCriteria: string[];
    extractedData?: Record<string, unknown>;
}

export interface TaskResult {
    taskId: string;
    taskName: string;
    status: "success" | "partial" | "failed" | "timeout" | "error";
    verification: VerificationResult;
    metrics: ExecutionMetrics;
    actions: AgentAction[];
    browserStates: BrowserState[]; // Snapshots at key moments
    startTime: number;
    endTime: number;
    errorLog: string[];
    agentOutput?: string; // Final agent response
}

// ============================================
// EVALUATION SUITE TYPES
// ============================================

export interface EvalSuite {
    id: string;
    name: string;
    description: string;
    version: string;
    tasks: TaskDefinition[];
    createdAt: number;
    updatedAt: number;
}

export interface EvalRun {
    id: string;
    suiteId: string;
    suiteName: string;
    agentId: string;
    agentName: string;
    results: TaskResult[];
    summary: EvalSummary;
    startTime: number;
    endTime: number;
    config: EvalConfig;
}

export interface EvalSummary {
    totalTasks: number;
    successCount: number;
    partialCount: number;
    failedCount: number;
    successRate: number; // 0-100
    averagePartialScore: number; // 0-100
    averageExecutionTimeMs: number;
    averageActions: number;
    totalLLMCalls: number;
    totalTokens: number;
    failureModes: FailureMode[];
}

export interface FailureMode {
    type: FailureModeType;
    count: number;
    taskIds: string[];
}

export type FailureModeType =
    | "navigation_error"
    | "element_not_found"
    | "incorrect_action"
    | "timeout"
    | "verification_failed"
    | "exception"
    | "rate_limited"
    | "unknown";

export interface EvalConfig {
    headless: boolean;
    recordVideo: boolean;
    saveScreenshots: boolean;
    retryCount: number;
    parallelTasks: number;
    browserType: "chromium" | "firefox" | "webkit";
    viewport: { width: number; height: number };
}

// ============================================
// AGENT INTERFACE
// ============================================

export interface AgentInterface {
    id: string;
    name: string;
    version: string;

    // The main function that the framework calls
    execute(task: AgentTask): Promise<AgentResponse>;
}

export interface AgentTask {
    instruction: string;
    startingUrl: string;
    structuredInputs?: Record<string, string | number | boolean>;
    limits: TaskLimits;
    context?: string; // Additional context if needed
}

export interface AgentResponse {
    success: boolean;
    finalState: BrowserState;
    actions: AgentAction[];
    reasoning: string;
    extractedData?: Record<string, unknown>;
    error?: string;
    metrics: {
        llmApiCalls: number;
        inputTokens: number;
        outputTokens: number;
    };
}
