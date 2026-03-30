/**
 * Session API v2 Client
 *
 * Run: bun run apps/session-api-v2/client.ts
 */

const API_BASE = "http://localhost:3457";
const DEFAULT_MODEL = "github-copilot/gemini-3-flash-preview";

type StartSessionRequest = {
  sessionId?: string;
  prompt: string;
  model?: string;
};

type StartSessionResponse =
  | {
      success: true;
      sessionId: string;
      title: string;
      status: "running";
    }
  | {
      success: false;
      error: string;
    };

type ListSessionsResponse = {
  sessions: Array<{
    id: string;
    title: string;
    status: "running" | "finished";
  }>;
};

type GetUpdatesResponse =
  | {
      success: true;
      sessionId: string;
      title: string;
      status: "running" | "finished";
      latestContent: string;
    }
  | {
      success: false;
      error: string;
    };

export async function startSession(
  prompt: string,
  sessionId?: string,
  model: string = DEFAULT_MODEL
): Promise<StartSessionResponse> {
  const body: StartSessionRequest = { prompt };
  if (sessionId) body.sessionId = sessionId;
  body.model = model;

  const res = await fetch(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

export async function listSessions(): Promise<ListSessionsResponse> {
  const res = await fetch(`${API_BASE}/sessions`);
  return res.json();
}

export async function getSessionUpdates(sessionId: string): Promise<GetUpdatesResponse> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/updates`);
  return res.json();
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("Session API v2 quick check");

  const quick = await startSession(
    "Say hi in one short line.",
    undefined,
    "opencode/minimax-m2.5-free"
  );
  console.log("quick-start:", quick);
  if (!quick.success) return;

  const long = await startSession(
    "Run !sleep 20 and then say done.",
    undefined,
    "opencode/minimax-m2.5-free"
  );
  console.log("long-start:", long);

  const continueQuick = await startSession(
    "Now say hi again with one emoji.",
    quick.sessionId,
    "opencode/minimax-m2.5-free"
  );
  console.log("continue-quick:", continueQuick);

  await sleep(2000);
  console.log("sessions:", await listSessions());
  console.log("quick-updates:", await getSessionUpdates(quick.sessionId));

  if (long.success) {
    console.log("long-updates-before-finish:", await getSessionUpdates(long.sessionId));
    await sleep(22000);
    console.log("long-updates-after-finish:", await getSessionUpdates(long.sessionId));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
