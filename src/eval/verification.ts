/**
 * Verification Engine - Validates task completion and calculates scores
 */

import type {
    TaskDefinition,
    BrowserState,
    VerificationResult,
    SubGoalResult,
    SuccessCriteria,
    DOMCheck,
    SubGoal,
} from "./types";
import { opencodeRunWithTokens } from "./opencode-run";

// ============================================
// MAIN VERIFICATION FUNCTION
// ============================================

export async function verifyTaskCompletion(
    task: TaskDefinition,
    finalState: BrowserState,
    stateHistory: BrowserState[] = []
): Promise<VerificationResult> {
    const subGoalResults = await verifySubGoals(task.subGoals, finalState, stateHistory);
    const criteriaResults = verifySuccessCriteria(task.successCriteria, finalState);

    const completedWeight = subGoalResults
        .filter((sg) => sg.completed)
        .reduce((sum, sg) => sum + sg.weight, 0);

    const totalWeight = subGoalResults.reduce((sum, sg) => sum + sg.weight, 0);
    const partialScore = totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;

    const allSubGoalsCompleted = subGoalResults.every((sg) => sg.completed);
    const allCriteriaMet = criteriaResults.failed.length === 0;
    const taskCompleted = allSubGoalsCompleted && allCriteriaMet;

    return {
        taskCompleted,
        partialScore: Math.round(partialScore * 100) / 100,
        subGoalResults,
        finalUrl: finalState.url,
        matchedCriteria: criteriaResults.matched,
        failedCriteria: criteriaResults.failed,
    };
}

// ============================================
// SUB-GOAL VERIFICATION
// ============================================

async function verifySubGoals(
    subGoals: SubGoal[],
    finalState: BrowserState,
    stateHistory: BrowserState[]
): Promise<SubGoalResult[]> {
    const results: SubGoalResult[] = [];

    for (const subGoal of subGoals) {
        const completed = await checkSubGoal(subGoal, finalState, stateHistory);
        results.push({
            id: subGoal.id,
            name: subGoal.name,
            completed,
            weight: subGoal.weight,
            details: completed ? "Verified" : "Not completed",
        });
    }

    return results;
}

async function checkSubGoal(
    subGoal: SubGoal,
    finalState: BrowserState,
    stateHistory: BrowserState[]
): Promise<boolean> {
    const { verification } = subGoal;

    switch (verification.type) {
        case "url":
            return checkUrlVerification(verification, finalState, stateHistory);

        case "dom":
            if (verification.domCheck) {
                return checkDOMElement(verification.domCheck, finalState.dom);
            }
            return false;

        case "state":
            // State verification would check localStorage, cookies, etc.
            return checkStateVerification(verification, finalState);

        case "custom":
            if (verification.customFn) {
                return runCustomVerification(verification.customFn, finalState, stateHistory);
            }
            return false;

        case "llm_judge":
            if (verification.judgePrompt) {
                return await checkLLMJudgeVerification(verification.judgePrompt, subGoal, finalState, stateHistory);
            }
            return false;

        default:
            return false;
    }
}

function checkUrlVerification(
    verification: SubGoal["verification"],
    finalState: BrowserState,
    stateHistory: BrowserState[]
): boolean {
    const allUrls = [...stateHistory.map((s) => s.url), finalState.url];

    if (verification.urlContains) {
        return allUrls.some((url) => url.includes(verification.urlContains!));
    }

    if (verification.urlPattern) {
        const pattern =
            typeof verification.urlPattern === "string"
                ? new RegExp(verification.urlPattern)
                : verification.urlPattern;
        return allUrls.some((url) => pattern.test(url));
    }

    return false;
}

function checkStateVerification(
    verification: SubGoal["verification"],
    state: BrowserState
): boolean {
    if (!verification.stateKey) return false;

    const value = state.localStorage?.[verification.stateKey];
    if (verification.stateValue !== undefined) {
        return value === String(verification.stateValue);
    }
    return value !== undefined;
}

/**
 * Use an LLM judge to verify if a sub-goal was completed.
 * This makes a separate OpenCode call that is NOT counted in the main task metrics.
 */
async function checkLLMJudgeVerification(
    judgePrompt: string,
    subGoal: SubGoal,
    finalState: BrowserState,
    stateHistory: BrowserState[]
): Promise<boolean> {
    try {
        // Build the judge prompt with context
        const fullPrompt = `${judgePrompt}

SUB-GOAL TO VERIFY: ${subGoal.name}
DESCRIPTION: ${subGoal.description}

CURRENT BROWSER STATE:
- URL: ${finalState.url}
- Title: ${finalState.title}
- DOM Content: ${finalState.dom.slice(0, 2000)}...

TASK HISTORY:
${stateHistory.map((state, i) => `Step ${i + 1}: ${state.url}`).join('\n')}

Respond with ONLY "YES" if the sub-goal was completed successfully, or "NO" if it was not.`;

        // Call OpenCode for judgment (using a smaller model for efficiency)
        const { output } = await opencodeRunWithTokens({
            prompt: fullPrompt,
            model: "flash", // Use smaller model for judging
            quiet: true,
        });

        // Parse the response
        const response = output.trim().toUpperCase();
        return response.includes("YES") && !response.includes("NO");

    } catch (error) {
        console.warn(`LLM judge failed for sub-goal "${subGoal.name}":`, error);
        return false; // Default to false on judge failure
    }
}

// ============================================
// SUCCESS CRITERIA VERIFICATION
// ============================================

function verifySuccessCriteria(
    criteria: SuccessCriteria,
    state: BrowserState
): { matched: string[]; failed: string[] } {
    const matched: string[] = [];
    const failed: string[] = [];

    // URL Pattern check
    if (criteria.urlPattern) {
        const pattern =
            typeof criteria.urlPattern === "string"
                ? new RegExp(criteria.urlPattern)
                : criteria.urlPattern;

        if (pattern.test(state.url)) {
            matched.push(`URL matches pattern: ${criteria.urlPattern}`);
        } else {
            failed.push(`URL does not match pattern: ${criteria.urlPattern}`);
        }
    }

    // URL Contains check
    if (criteria.urlContains) {
        if (state.url.includes(criteria.urlContains)) {
            matched.push(`URL contains: ${criteria.urlContains}`);
        } else {
            failed.push(`URL does not contain: ${criteria.urlContains}`);
        }
    }

    // Page Title check
    if (criteria.pageTitle) {
        const pattern =
            typeof criteria.pageTitle === "string"
                ? new RegExp(criteria.pageTitle, "i")
                : criteria.pageTitle;

        if (pattern.test(state.title)) {
            matched.push(`Page title matches: ${criteria.pageTitle}`);
        } else {
            failed.push(`Page title does not match: ${criteria.pageTitle}`);
        }
    }

    // DOM Elements check
    if (criteria.domElements) {
        for (const domCheck of criteria.domElements) {
            const result = checkDOMElement(domCheck, state.dom);
            if (result) {
                matched.push(`DOM check passed: ${domCheck.selector}`);
            } else {
                failed.push(`DOM check failed: ${domCheck.selector}`);
            }
        }
    }

    return { matched, failed };
}

// ============================================
// DOM CHECKING UTILITIES
// ============================================

/**
 * Check if a DOM element matches the specified criteria.
 * Uses simple string matching — for production, use a proper HTML parser.
 */
function checkDOMElement(check: DOMCheck, domContent: string): boolean {
    const selectorPattern = selectorToSearchPattern(check.selector);

    if (check.exists === false) {
        // Element should NOT exist
        return !domContent.includes(selectorPattern);
    }

    // Element should exist
    const elementExists = domContent.includes(selectorPattern);
    if (!elementExists) return false;

    // If just checking existence, we're done
    if (check.exists === true && !check.text && !check.attribute) {
        return true;
    }

    // Text content check
    if (check.text) {
        const textPattern =
            typeof check.text === "string" ? check.text : check.text.source;
        if (!domContent.includes(textPattern)) {
            return false;
        }
    }

    // Attribute check
    if (check.attribute) {
        const attrPattern = `${check.attribute.name}="${check.attribute.value}"`;
        if (!domContent.includes(attrPattern)) {
            return false;
        }
    }

    return true;
}

/**
 * Convert a CSS selector to a simple search pattern.
 * This is a simplified version — production would use proper DOM parsing.
 */
function selectorToSearchPattern(selector: string): string {
    // Handle ID selectors
    if (selector.startsWith("#")) {
        return `id="${selector.slice(1)}"`;
    }

    // Handle class selectors
    if (selector.startsWith(".")) {
        return `class="${selector.slice(1)}"`;
    }

    // Handle tag selectors
    if (/^[a-z]+$/i.test(selector)) {
        return `<${selector.toLowerCase()}`;
    }

    // Handle attribute selectors [attr="value"]
    const attrMatch = selector.match(/\[([^=]+)="([^"]+)"\]/);
    if (attrMatch) {
        return `${attrMatch[1]}="${attrMatch[2]}"`;
    }

    // Fallback: return as-is
    return selector;
}

// ============================================
// CUSTOM VERIFICATION REGISTRY
// ============================================

type CustomVerificationFn = (
    state: BrowserState,
    history: BrowserState[]
) => boolean;

const customVerifications = new Map<string, CustomVerificationFn>();

export function registerCustomVerification(
    name: string,
    fn: CustomVerificationFn
): void {
    customVerifications.set(name, fn);
}

export function runCustomVerification(
    name: string,
    state: BrowserState,
    history: BrowserState[]
): boolean {
    const fn = customVerifications.get(name);
    if (!fn) {
        console.warn(`Custom verification "${name}" not found`);
        return false;
    }
    return fn(state, history);
}

// ============================================
// SCORING UTILITIES
// ============================================

export function calculatePartialScore(subGoalResults: SubGoalResult[]): number {
    const completedWeight = subGoalResults
        .filter((sg) => sg.completed)
        .reduce((sum, sg) => sum + sg.weight, 0);

    const totalWeight = subGoalResults.reduce((sum, sg) => sum + sg.weight, 0);

    if (totalWeight === 0) return 0;
    return Math.round((completedWeight / totalWeight) * 100 * 100) / 100;
}

export function categorizeFailure(
    result: VerificationResult,
    errorLog: string[]
): string {
    if (errorLog.some((e) => e.includes("timeout"))) {
        return "timeout";
    }
    if (errorLog.some((e) => e.includes("element not found"))) {
        return "element_not_found";
    }
    if (errorLog.some((e) => e.includes("navigation"))) {
        return "navigation_error";
    }
    if (result.partialScore > 0 && !result.taskCompleted) {
        return "verification_failed";
    }
    if (errorLog.length > 0) {
        return "exception";
    }
    return "unknown";
}
