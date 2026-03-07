import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * LLM wrapper for the memory condensation pipeline.
 *
 * Pattern: identical to the eval judge provider — spawn `opencode run --format json`
 * and parse the JSONL text events. No direct API key needed; opencode handles
 * all auth via its own config (opencode.json + provider credentials).
 *
 * Model: uses the flash model by default (fast + cheap, suitable for compression tasks).
 */

const DEFAULT_MODEL = "google/antigravity-gemini-3-flash";

/** Extract text from opencode JSONL event stream */
function extractTextFromJsonl(stdout: string): string {
    const lines = stdout.split("\n").filter(l => l.trim().length > 0);
    const parts: string[] = [];

    for (const line of lines) {
        try {
            const event = JSON.parse(line);
            // Primary: {type: "text", part: {type: "text", text: "..."}}
            if (event?.type === "text" && event?.part?.type === "text" && typeof event?.part?.text === "string") {
                parts.push(event.part.text);
            }
        } catch {
            // skip non-JSON lines
        }
    }

    if (parts.length > 0) return parts.join("").trim();

    // Fallback: return raw stdout stripped of obvious ANSI/control sequences
    return stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").trim();
}

/**
 * Call the LLM via opencode run --format json.
 * Prompt is written to a temp file to avoid CLI length limits.
 */
export async function llmSummarize(prompt: string, model = DEFAULT_MODEL): Promise<string> {
    const tmpFile = join(tmpdir(), `memory-condense-${Date.now()}.txt`);

    try {
        writeFileSync(tmpFile, prompt, "utf8");

        const args = [
            "run",
            "Respond with only the requested output. No preamble, no commentary.",
            "-f",
            tmpFile,
            "--format",
            "json",
            "--model",
            model,
        ];

        const proc = Bun.spawn(["opencode", ...args], {
            cwd: process.cwd(), // picks up opencode.json automatically
            stdout: "pipe",
            stderr: "pipe",
        });

        // Timeout: 60s (condensation prompts are simple)
        const result = await Promise.race([
            (async () => {
                const [stdout] = await Promise.all([
                    new Response(proc.stdout).text(),
                    new Response(proc.stderr).text(),
                ]);
                const exitCode = await proc.exited;
                return { stdout, exitCode };
            })(),
            new Promise<"TIMEOUT">(resolve => setTimeout(() => resolve("TIMEOUT"), 60_000)),
        ]);

        if (result === "TIMEOUT") {
            try { proc.kill(); } catch { /* ignore */ }
            throw new Error("LLM call timed out after 60s");
        }

        if (result.exitCode !== 0) {
            throw new Error(`opencode exited with code ${result.exitCode}`);
        }

        const text = extractTextFromJsonl(result.stdout);
        if (!text) throw new Error("Empty response from opencode");
        return text;

    } finally {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}
