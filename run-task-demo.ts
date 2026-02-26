/**
 * Task Eval Demo
 *
 * Demonstrates the task evaluation framework using the MockAgent.
 * To use a real agent, implement AgentInterface from src/eval/types.ts
 * and pass it to TaskRunner instead.
 *
 * Run: bun run run-task-demo.ts
 */

import {
    MockAgent,
    TaskRunner,
    type TaskDefinition,
    formatTaskResult,
} from "./src/eval/index";

// A simple task definition to demonstrate the framework.
// Uses only url/dom verification (no llm_judge) so MockAgent can complete it instantly.
const simpleTask: TaskDefinition = {
    id: "DEMO_001",
    name: "Simple Wikipedia Navigation",
    description: "Navigate to a Wikipedia article and find information",
    category: "navigation",
    instruction: `Go to Wikipedia and navigate to the TypeScript article. 
  Find when TypeScript was first released and who created it.`,
    startingUrl: "https://en.wikipedia.org",
    structuredInputs: {
        topic: "TypeScript",
    },
    successCriteria: {
        // MockAgent returns startingUrl + "/result", so this won't match — expect partial score
        urlContains: "TypeScript",
    },
    subGoals: [
        {
            id: "sg_start",
            name: "Started on Wikipedia",
            description: "Loaded Wikipedia homepage",
            weight: 0.25,
            // MockAgent uses startingUrl as navigation target — this will match
            verification: { type: "url", urlContains: "wikipedia.org" },
        },
        {
            id: "sg_article",
            name: "Reached TypeScript Article",
            description: "Navigated to the TypeScript article",
            weight: 0.75,
            // MockAgent returns startingUrl + "/result" — this won't match (expected in mock mode)
            verification: { type: "url", urlContains: "TypeScript" },
        },
    ],
    limits: {
        maxActions: 15,
        maxTimeSeconds: 300,
        maxLLMCalls: 10,
    },
};

async function main() {
    console.log("=".repeat(60));
    console.log("     Running Task Eval Demo (MockAgent)");
    console.log("=".repeat(60));

    console.log("\nTask Details:");
    console.log(`  ID: ${simpleTask.id}`);
    console.log(`  Name: ${simpleTask.name}`);
    console.log(`  URL: ${simpleTask.startingUrl}`);
    console.log(`  Instruction: ${simpleTask.instruction.slice(0, 80).trim()}...`);

    console.log("\n  Sub-Goals:");
    for (const sg of simpleTask.subGoals) {
        console.log(`    - ${sg.name} (weight: ${sg.weight})`);
    }

    console.log("\n" + "-".repeat(60));
    console.log("Running task...\n");

    // Use MockAgent — replace with a real AgentInterface implementation to run real tasks
    const agent = new MockAgent();
    const runner = new TaskRunner(agent, { retryCount: 0 });

    const startTime = Date.now();
    const result = await runner.runTask(simpleTask);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "-".repeat(60));
    console.log("RESULTS\n");

    console.log(`Task: ${result.taskName} (${result.taskId})`);
    console.log(`Status: ${result.status.toUpperCase()}`);
    console.log(`Score: ${result.verification.partialScore.toFixed(1)}%`);
    console.log(`Completed: ${result.verification.taskCompleted ? "Yes" : "No"}`);

    console.log("\nSub-Goal Results:");
    for (const sg of result.verification.subGoalResults) {
        const icon = sg.completed ? "[OK]" : "[--]";
        console.log(`  ${icon} ${sg.name}: ${sg.details || (sg.completed ? "Passed" : "Failed")}`);
    }

    console.log("\nMetrics:");
    console.log(`  Actions: ${result.metrics.totalActions}`);
    console.log(`  Time: ${(result.metrics.executionTimeMs / 1000).toFixed(1)}s`);
    console.log(`  LLM Calls: ${result.metrics.llmApiCalls}`);
    console.log(`  Tokens: ${result.metrics.totalTokens}`);

    console.log("\n" + "-".repeat(60));
    console.log(`Total time: ${duration}s`);
    console.log("=".repeat(60));

    // Save result to file
    await Bun.write("eval-result.json", JSON.stringify({
        task: { id: result.taskId, name: result.taskName },
        status: result.status,
        score: result.verification.partialScore,
        completed: result.verification.taskCompleted,
        subGoals: result.verification.subGoalResults,
        metrics: result.metrics,
        duration: `${duration}s`,
    }, null, 2));
    console.log("\nResult saved to eval-result.json");
}

main().catch((error) => {
    console.error("\nError:", error.message || error);
    process.exit(1);
});
