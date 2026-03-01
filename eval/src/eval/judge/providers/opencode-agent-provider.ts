/**
 * OpenCode Agent Provider for the Judge
 *
 * Runs `opencode run --agent judge --format json` and extracts the assistant's
 * text from the JSONL event stream.
 *
 * Why --format json?
 *   Without it, opencode emits raw TTY output (ANSI codes, spinners, status
 *   lines) that cannot be reliably parsed. --format json emits one JSON object
 *   per line (JSONL), each with a `type` field identifying the event kind.
 *
 * Why --agent judge?
 *   Loads .opencode/agents/judge.md as the system prompt, which enforces
 *   strict JSON-only output and the fixed taxonomy rubric.
 *
 * Event extraction strategy:
 *   We look for events where type === "assistant" and extract the text content
 *   blocks. This gives us the raw assistant reply without UI framing.
 *   If no assistant events are found, we fall back to concatenating all text
 *   found in any event that looks like a message.
 */

import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── JSONL event shapes ───────────────────────────────────────────────────────
// Actual opencode --format json event shapes observed:
//   {"type":"text",       "part":{"type":"text","text":"<assistant reply>",...}}
//   {"type":"step_start", "part":{...}}
//   {"type":"step_finish","part":{"tokens":{...},...}}

interface OpenCodeTextEvent {
  type: "text";
  part: {
    type: "text";
    text: string;
  };
}

interface OpenCodeGenericEvent {
  type: string;
  part?: Record<string, unknown>;
  text?: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ProviderOptions {
  /** Model to use for the judge (defaults to model in eval-config / opencode default) */
  model?: string;
  /** Timeout in milliseconds (default 90 000) */
  timeoutMs?: number;
}

export interface ProviderResult {
  /** Extracted assistant text (the JSON verdict) */
  assistantText: string;
  /** All JSONL lines received (for debugging) */
  rawLines: string[];
  /** Full stdout in case JSONL parsing fails completely */
  rawStdout: string;
  exitCode: number;
}

/**
 * Run the judge agent for the given prompt and extract the assistant's reply.
 *
 * The prompt is written to a temp file and passed via -f (file attachment) to
 * avoid CLI argument length limits.
 */
export async function runJudgeAgent(
  prompt: string,
  options: ProviderOptions = {}
): Promise<ProviderResult> {
  const { model, timeoutMs = 90_000 } = options;

  // Write prompt to temp file
  const tmpFile = join(tmpdir(), `eval-judge-${Date.now()}.txt`);
  writeFileSync(tmpFile, prompt, "utf8");

  const args: string[] = [
    "run",
    "Grade this eval task exactly as instructed in the attached file. Output only the JSON object.",
    "-f",
    tmpFile,
    "--agent",
    "judge",
    "--format",
    "json",
  ];
  if (model) args.push("--model", model);

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["opencode", ...args], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    cleanupTmp(tmpFile);
    throw new Error(
      `Failed to spawn opencode: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Race against timeout
  const result = await Promise.race([
    collectOutput(proc),
    sleep(timeoutMs).then(() => "TIMEOUT" as const),
  ]);

  cleanupTmp(tmpFile);

  if (result === "TIMEOUT") {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    throw new Error(`Judge agent timed out after ${timeoutMs / 1000}s`);
  }

  const { stdout, exitCode } = result;

  // Parse JSONL events and extract assistant text
  const rawLines = stdout.split("\n").filter(l => l.trim().length > 0);
  const assistantText = extractAssistantText(rawLines);

  // Debug logging for empty assistant text
  if (!assistantText) {
    const errorEvents = rawLines.filter(l => {
      try {
        const ev = JSON.parse(l);
        return ev.type === "error";
      } catch {
        return false;
      }
    });
    console.warn(
      `[judge-provider] Empty assistant text. ` +
        `exitCode=${exitCode}, rawLines=${rawLines.length}, ` +
        `stdout=${stdout.length} bytes` +
        (errorEvents.length ? `, errors: ${errorEvents.join(" | ")}` : "")
    );
  }

  return { assistantText, rawLines, rawStdout: stdout, exitCode };
}

// ─── JSONL assistant text extractor ──────────────────────────────────────────

/**
 * Extract assistant text from JSONL event lines.
 *
 * opencode --format json emits one JSON object per line:
 *   {"type":"text", "part":{"type":"text","text":"<assistant reply>",...}}
 *
 * Collects all text chunks from type==="text" events and concatenates them.
 * Falls back to scanning all string values in any event if nothing is found.
 */
function extractAssistantText(lines: string[]): string {
  const parts: string[] = [];

  for (const line of lines) {
    let event: OpenCodeGenericEvent | null = null;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (!event || typeof event !== "object") continue;

    // Primary: type === "text" with part.text (the actual assistant reply)
    if (event.type === "text") {
      const part = (event as OpenCodeTextEvent).part;
      if (part && part.type === "text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("").trim();
  }

  // Fallback: scan all events for any string value longer than 10 chars
  for (const line of [...lines].reverse()) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const candidate = findFirstString(event);
      if (candidate && candidate.trim().length > 10) {
        return candidate.trim();
      }
    } catch {
      /* skip */
    }
  }

  return "";
}

/** DFS through a JSON object to find the first string value with length > 10 */
function findFirstString(obj: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof obj === "string" && obj.length > 10) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findFirstString(item, depth + 1);
      if (found) return found;
    }
  } else if (obj && typeof obj === "object") {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      const found = findFirstString(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function collectOutput(proc: ReturnType<typeof Bun.spawn>) {
  const readStream = async (s: unknown): Promise<string> => {
    if (!s || typeof s !== "object") return "";
    return new Response(s as ReadableStream).text();
  };
  const [stdout] = await Promise.all([readStream(proc.stdout), readStream(proc.stderr)]);
  const exitCode = await proc.exited;
  return { stdout, exitCode };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanupTmp(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}
