/**
 * LLM-as-Judge
 *
 * Runs a second `opencode run` call after the task completes.
 * Passes the full agent output text + screenshot (if available) and asks
 * the model to grade: PASS / PARTIAL / FAIL with a one-sentence reason.
 *
 * Screenshot strategy:
 *   - If screenshotPath is given and the file exists on disk, we base64-encode
 *     it and embed it directly in the grading prompt so the judge sees the image.
 *   - The full agent text output is always included.
 */

import { existsSync, writeFileSync, unlinkSync } from "fs";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type JudgeVerdict = "PASS" | "PARTIAL" | "FAIL";

export interface JudgeResult {
    verdict: JudgeVerdict;
    score: number;          // PASS=100, PARTIAL=50, FAIL=0
    reason: string;
    usedScreenshot: boolean;
}

/**
 * Judge a completed task using an LLM.
 *
 * @param taskName       Human-readable task name
 * @param taskInstruction  The original instruction given to the agent
 * @param agentOutput    Full stdout captured from the agent run
 * @param screenshotPath Optional path to a screenshot file saved by the agent
 * @param runDir         Directory where the current eval run is stored (for resolving relative paths)
 */
export async function judgeTask(
    taskName: string,
    taskInstruction: string,
    agentOutput: string,
    screenshotPath?: string,
    runDir?: string,
): Promise<JudgeResult> {
    // Resolve screenshot
    let screenshotB64: string | null = null;
    let resolvedPath: string | null = null;

    if (screenshotPath) {
        // Try relative to runDir first, then cwd
        const candidates = [
            runDir ? join(runDir, screenshotPath) : null,
            join(process.cwd(), screenshotPath),
            screenshotPath,
        ].filter(Boolean) as string[];

        for (const p of candidates) {
            if (existsSync(p)) {
                resolvedPath = p;
                break;
            }
        }

        if (resolvedPath) {
            try {
                screenshotB64 = readFileSync(resolvedPath).toString("base64");
            } catch {
                screenshotB64 = null;
            }
        }
    }

    const usedScreenshot = screenshotB64 !== null;

    // Build grading prompt
    const prompt = buildJudgePrompt(
        taskName,
        taskInstruction,
        agentOutput,
        screenshotB64,
        resolvedPath,
    );

    // Call opencode run for the verdict
    let raw = "";
    try {
        raw = await runOpencode(prompt);
    } catch (err) {
        return {
            verdict: "FAIL",
            score: 0,
            reason: `Judge call failed: ${err instanceof Error ? err.message : String(err)}`,
            usedScreenshot,
        };
    }

    return parseVerdict(raw, usedScreenshot);
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildJudgePrompt(
    taskName: string,
    taskInstruction: string,
    agentOutput: string,
    screenshotB64: string | null,
    screenshotPath: string | null,
): string {
    const lines: string[] = [];

    lines.push(`You are an impartial evaluator. Grade the following AI agent run and reply ONLY in the exact format specified. Do not ask questions or add commentary.`);
    lines.push(``);
    lines.push(`TASK NAME: ${taskName}`);
    lines.push(`TASK INSTRUCTION: ${taskInstruction}`);
    lines.push(``);
    lines.push(`AGENT OUTPUT (full text):`);
    lines.push("---");
    lines.push(agentOutput.trim());
    lines.push("---");

    if (screenshotB64 && screenshotPath) {
        lines.push(``);
        lines.push(`SCREENSHOT: The agent saved a screenshot at: ${screenshotPath}`);
        lines.push(`Load the agent-browser skill, connect to port 9222, and open this file to inspect it:`);
        lines.push(`  file://${screenshotPath.replace(/\\/g, "/")}`);
        lines.push(`Use what you see in the screenshot as additional evidence for your verdict.`);
    }

    lines.push(``);
    lines.push(`Now reply in EXACTLY this format and nothing else:`);
    lines.push(`VERDICT: <PASS|PARTIAL|FAIL>`);
    lines.push(`REASON: <one sentence>`);
    lines.push(``);
    lines.push(`PASS = task fully completed. PARTIAL = some steps done. FAIL = not completed or wrong result.`);

    return lines.join("\n");
}

// ─── Verdict parser ───────────────────────────────────────────────────────────

function parseVerdict(raw: string, usedScreenshot: boolean): JudgeResult {
    const verdictMatch = raw.match(/VERDICT:\s*(PASS|PARTIAL|FAIL)/i);
    const reasonMatch = raw.match(/REASON:\s*(.+)/i);

    const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FAIL") as JudgeVerdict;
    const reason = reasonMatch?.[1]?.trim() ?? raw.trim().slice(0, 200);

    const score = verdict === "PASS" ? 100 : verdict === "PARTIAL" ? 50 : 0;

    return { verdict, score, reason, usedScreenshot };
}

// ─── opencode subprocess ──────────────────────────────────────────────────────

async function runOpencode(prompt: string): Promise<string> {
    // Write prompt to a temp file so we don't hit CLI argument length limits
    // Pass it via -f (file attachment) with a short imperative message
    const tmpFile = join(tmpdir(), `eval-judge-${Date.now()}.txt`);
    writeFileSync(tmpFile, prompt, "utf8");

    let proc: ReturnType<typeof Bun.spawn>;
    try {
        proc = Bun.spawn(
            ["opencode", "run", "Grade this eval run exactly as instructed in the attached file.", "-f", tmpFile, "--model", "google/antigravity-gemini-3.1-pro"],
            { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
        );
    } catch (err) {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        throw err;
    }

    const readStream = async (s: unknown): Promise<string> => {
        if (!s || typeof s !== "object") return "";
        return new Response(s as ReadableStream).text();
    };

    const [stdout] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
    ]);

    const exitCode = await proc.exited;
    try { unlinkSync(tmpFile); } catch { /* ignore */ }

    if (exitCode !== 0) {
        throw new Error(`opencode judge exited ${exitCode}: ${stdout.slice(0, 200)}`);
    }

    return stdout;
}
