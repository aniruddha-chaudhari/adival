/**
 * Session API v3 Client
 *
 * Run: bun run apps/session-api-v3/client.ts
 */

const API_BASE = "http://localhost:3458";
const DEFAULT_MODEL = "github-copilot/gemini-3-flash-preview";

type StartSessionRequest = {
  sessionId?: string;
  prompt: string;
  model?: string;
  clientId?: string;
};

type SessionSummary = {
  id: string;
  title: string;
  status: "running" | "finished";
};

export async function startSession(
  prompt: string,
  options?: { sessionId?: string; model?: string; clientId?: string }
): Promise<unknown> {
  const body: StartSessionRequest = {
    prompt,
    model: options?.model || DEFAULT_MODEL,
    sessionId: options?.sessionId,
    clientId: options?.clientId,
  };

  const res = await fetch(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

export async function listSessions(): Promise<Record<string, SessionSummary[]>> {
  const res = await fetch(`${API_BASE}/sessions`);
  return res.json();
}

async function main(): Promise<void> {
  console.log("sessions:", await listSessions());
  console.log(
    "local-start:",
    await startSession("Say hello from api-v3.", { model: "opencode/minimax-m2.5-free" })
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
