/**
 * OpenCode Token Usage - Fetch real input/output token counts and timing from a session.
 *
 * Parses the actual `opencode export` JSON structure:
 *   messages[].info.tokens.input / .output
 *   info.time.created / .updated  (session duration)
 *
 * Usage:
 *   import { getLatestSessionTokens, getSessionTokens } from "./opencode-tokens";
 *
 *   const result = await getLatestSessionTokens();
 *   console.log(result);
 *   // { sessionId: "ses_...", inputTokens: 10212, outputTokens: 3, totalTokens: 10215,
 *   //   durationMs: 7268, byModel: { "antigravity-gemini-3-pro": { ... } } }
 */

const OPENCODE = "opencode";

// ─────────────────────────────────────────────────────────────────────────────
// Types — matching actual `opencode export` JSON shape
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** Wall-clock duration of the session in milliseconds (updated - created) */
  durationMs: number | null;
  /** Per-model breakdown when multiple models are used */
  byModel?: Record<string, { inputTokens: number; outputTokens: number }>;
}

interface MessageTokens {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

interface MessageInfo {
  role: string;
  modelID?: string;
  providerID?: string;
  model?: { providerID?: string; modelID?: string };
  tokens?: MessageTokens;
  time?: { created?: number; completed?: number };
}

interface SessionMessage {
  info: MessageInfo;
  parts?: unknown[];
}

/** Shape returned by `opencode export <id>` */
interface SessionExport {
  info: {
    id: string;
    time?: { created?: number; updated?: number };
  };
  messages?: SessionMessage[];
}

/** Shape of one entry from `opencode session list --format json` */
interface SessionListEntry {
  id: string;
  title?: string;
  time?: { created?: number; updated?: number };
  // older versions may have flat fields
  createdAt?: string | number;
  updatedAt?: string | number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Run a subprocess and return stdout as a string. */
async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return stdout.trim();
}

/**
 * List all sessions and return them as parsed JSON.
 * Returns newest first (index 0 = most recent).
 */
export async function listSessions(): Promise<SessionListEntry[]> {
  const raw = await run([OPENCODE, "session", "list", "--format", "json"]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get the ID of the most recently created/updated session.
 */
export async function getLatestSessionId(): Promise<string | null> {
  const sessions = await listSessions();
  const first = sessions[0];
  if (!first) return null;
  return first.id ?? null;
}

/**
 * Export a session by ID and return the raw JSON object.
 */
export async function exportSession(sessionId: string): Promise<SessionExport | null> {
  const raw = await run([OPENCODE, "export", sessionId]);
  if (!raw) return null;
  // strip the "Exporting session: ..." line that opencode prints to stdout
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(raw.slice(jsonStart)) as SessionExport;
  } catch {
    return null;
  }
}

/** Extract creation timestamp from a session list entry */
function getSessionCreatedMs(s: SessionListEntry): number | null {
  const fromTime = s.time?.created;
  if (fromTime) return fromTime;
  const flat = s.createdAt ?? s.updatedAt;
  if (!flat) return null;
  return typeof flat === "number" ? flat : new Date(flat).getTime();
}

/**
 * Sum tokens and timing from an exported session.
 */
function parseExport(data: SessionExport): Omit<TokenUsage, "sessionId"> {
  const messages = data.messages ?? [];
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  const byModel: Record<string, { inputTokens: number; outputTokens: number }> = {};

  // Track earliest created and latest completed across assistant messages
  let earliestCreated: number | null = null;
  let latestCompleted: number | null = null;

  for (const msg of messages) {
    const info = msg.info;
    if (!info) continue;

    // Token counting — only assistant messages have tokens
    if (info.tokens) {
      const t = info.tokens;
      inputTokens += t.input ?? 0;
      outputTokens += t.output ?? 0;
      reasoningTokens += t.reasoning ?? 0;

      const modelId = info.modelID ?? info.model?.modelID;
      if (modelId) {
        if (!byModel[modelId]) byModel[modelId] = { inputTokens: 0, outputTokens: 0 };
        const entry = byModel[modelId]!;
        entry.inputTokens += t.input ?? 0;
        entry.outputTokens += t.output ?? 0;
      }
    }

    // Timing — track span across all messages
    if (info.time?.created) {
      if (earliestCreated === null || info.time.created < earliestCreated)
        earliestCreated = info.time.created;
    }
    if (info.time?.completed) {
      if (latestCompleted === null || info.time.completed > latestCompleted)
        latestCompleted = info.time.completed;
    }
  }

  // Prefer session-level time if available
  const sessionCreated = data.info.time?.created ?? earliestCreated;
  const sessionUpdated = data.info.time?.updated ?? latestCompleted;
  const durationMs =
    sessionCreated != null && sessionUpdated != null ? sessionUpdated - sessionCreated : null;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + reasoningTokens,
    durationMs,
    byModel: Object.keys(byModel).length > 0 ? byModel : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch token usage and duration for a specific session by ID.
 *
 * @example
 * const result = await getSessionTokens("ses_abc123");
 * console.log(result.inputTokens, result.outputTokens, result.durationMs);
 */
export async function getSessionTokens(sessionId: string): Promise<TokenUsage | null> {
  const data = await exportSession(sessionId);
  if (!data) return null;
  return { sessionId, ...parseExport(data) };
}

/**
 * Fetch token usage for the **most recent** session.
 * Call this immediately after `opencodeRun()` completes.
 *
 * @example
 * await opencodeRun({ prompt: "do the task" });
 * const result = await getLatestSessionTokens();
 * // { sessionId: "ses_...", inputTokens: 10212, outputTokens: 3, durationMs: 7268 }
 */
export async function getLatestSessionTokens(): Promise<TokenUsage | null> {
  const sessionId = await getLatestSessionId();
  if (!sessionId) {
    console.warn("[opencode-tokens] No sessions found.");
    return null;
  }
  return getSessionTokens(sessionId);
}

/**
 * Fetch token usage for the session created **after** a given timestamp (ms).
 * Capture `Date.now()` before calling `opencodeRun` to target the right session.
 *
 * @example
 * const before = Date.now();
 * await opencodeRun({ prompt: "..." });
 * const result = await getSessionTokensSince(before);
 */
export async function getSessionTokensSince(sinceMs: number): Promise<TokenUsage | null> {
  const sessions = await listSessions();

  const target = sessions.find(s => {
    const created = getSessionCreatedMs(s);
    return created !== null && created >= sinceMs;
  });

  if (!target) {
    return getLatestSessionTokens();
  }

  return getSessionTokens(target.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI usage: `bun run src/eval/opencode-tokens.ts [sessionId]`
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const sessionId = process.argv[2];
  const result = sessionId ? await getSessionTokens(sessionId) : await getLatestSessionTokens();

  if (!result) {
    console.error("Could not retrieve token usage.");
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}
