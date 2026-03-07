/**
 * Run OpenCode from code and get AI output.
 * Usage: bun run src/eval/opencode-run.ts [--prompt "your query"]
 *
 * Examples:
 *   bun run src/eval/opencode-run.ts -- --model google/antigravity-gemini-3.1-pro --prompt "Explain the main function"
 *   bun run src/eval/opencode-run.ts -- --model pro --prompt "explain index.ts"
 *   bun run src/eval/opencode-run.ts -- --command test
 *   bun run src/eval/opencode-run.ts -- --prompt "review this" --format json
 *   bun run src/eval/opencode-run.ts -- --prompt "analyze" --models flash pro
 */

import { getSessionTokensSince, type TokenUsage } from "./opencode-tokens";

const OPENCODE = "opencode";

// Default models
const DEFAULT_MODELS = {
  flash: "opencode/minimax-m2.5-free",
  pro: "opencode/minimax-m2.5-free",
};

interface RunOptions {
  prompt?: string;
  command?: string;
  format?: "default" | "json";
  quiet?: boolean;
  model?: string;
  agent?: string;
}

/**
 * Run opencode and return stdout as string.
 * In non-interactive mode OpenCode auto-approves permissions so it won't hang.
 */
export async function opencodeRun(options: RunOptions): Promise<string> {
  const args: string[] = ["run"];

  const resolvedModel =
    options.model && DEFAULT_MODELS[options.model as keyof typeof DEFAULT_MODELS]
      ? DEFAULT_MODELS[options.model as keyof typeof DEFAULT_MODELS]
      : options.model;

  if (options.prompt) args.push(options.prompt);
  if (options.command) args.push("--command", options.command);
  if (options.format && options.format !== "default") {
    args.push("--format", options.format);
  }
  if (options.quiet) args.push("--quiet");
  if (resolvedModel) args.push("--model", resolvedModel);
  if (options.agent) args.push("--agent", options.agent);

  const proc = Bun.spawn([OPENCODE, ...args], {
    cwd: process.cwd(), // Use current working directory to pick up opencode.json
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errorMsg = stderr || stdout || "Unknown error";
    console.error("OpenCode Error:", errorMsg);
    throw new Error(`opencode run exited with ${exitCode}: ${errorMsg}`);
  }

  return stdout;
}

/**
 * Run opencode and return output with elapsed time in milliseconds.
 */
export async function opencodeRunWithTiming(
  options: RunOptions
): Promise<{ output: string; elapsedMs: number }> {
  const start = performance.now();
  const output = await opencodeRun(options);
  const elapsedMs = Math.round(performance.now() - start);
  return { output, elapsedMs };
}

/**
 * Run opencode with multiple models and return results for each.
 * Useful for comparing outputs from different models.
 */
export async function opencodeRunMultiModel(
  options: Omit<RunOptions, "model"> & { models: string[] }
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const model of options.models) {
    const output = await opencodeRun({ ...options, model });
    results[model] = output;
  }

  return results;
}

/**
 * Run opencode and return output **plus** actual token usage for the session.
 *
 * @example
 * const { output, elapsedMs, tokens } = await opencodeRunWithTokens({
 *   prompt: "Explain main function",
 *   model: "flash",
 * });
 * console.log(`Input: ${tokens.inputTokens}, Output: ${tokens.outputTokens}`);
 */
export async function opencodeRunWithTokens(
  options: RunOptions
): Promise<{ output: string; elapsedMs: number; tokens: TokenUsage | null }> {
  const before = Date.now();
  const { output, elapsedMs } = await opencodeRunWithTiming(options);
  const tokens = await getSessionTokensSince(before);
  return { output, elapsedMs, tokens };
}

// CLI: parse args and run
async function main() {
  const argv = process.argv.slice(2);
  const options: RunOptions = {};
  const models: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prompt" || arg === "-p") options.prompt = argv[++i];
    else if (arg === "--command") options.command = argv[++i];
    else if (arg === "--format") options.format = argv[++i] as RunOptions["format"];
    else if (arg === "--quiet" || arg === "-q") options.quiet = true;
    else if (arg === "--model" || arg === "-m") {
      const modelName = argv[++i];
      options.model = DEFAULT_MODELS[modelName as keyof typeof DEFAULT_MODELS] || modelName;
    } else if (arg === "--agent") options.agent = argv[++i];
    else if (arg === "--models") {
      // Support --models flash pro or --models "model1" "model2"
      while (i + 1 < argv.length) {
        const nextArg = argv[i + 1];
        if (nextArg === undefined || nextArg.startsWith("--")) break;
        const modelName = argv[++i];
        if (!modelName) break;
        // Map shorthand names to full model IDs
        const fullModelId = DEFAULT_MODELS[modelName as keyof typeof DEFAULT_MODELS] || modelName;
        models.push(fullModelId);
      }
    }
  }

  if (!options.prompt && !options.command) {
    console.log(`
Usage:
  bun run src/eval/opencode-run.ts -- --prompt "your query"
  bun run src/eval/opencode-run.ts -- --command test
  bun run src/eval/opencode-run.ts -- --prompt "review" --format json --quiet
  bun run src/eval/opencode-run.ts -- --prompt "analyze" --models flash pro

Flags:
  --prompt|-p          Query prompt (sent as the message positional)
  --command            Custom command name
  --format             Output format (default|json)
  --quiet|-q           Hide loading spinner
  --model|-m           Single model to use
  --models             Multiple models (use "flash" "pro" or full model IDs)
  --agent              Agent to use

Default model shortcuts:
  flash -> google/antigravity-gemini-3-flash
  pro   -> google/antigravity-gemini-3.1-pro
`);
    process.exit(1);
  }

  // If multiple models specified, run with each
  if (models.length > 0) {
    const results = await opencodeRunMultiModel({
      ...options,
      models,
    });

    for (const [model, output] of Object.entries(results)) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Model: ${model}`);
      console.log("=".repeat(60));
      console.log(output);
    }
  } else {
    // Single model run (or use default if none specified)
    const output = await opencodeRun(options);
    console.log(output);
  }
}

// Only run main() if this file is executed directly (not imported)
if (import.meta.main) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
