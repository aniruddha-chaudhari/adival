/**
 * Session API Client
 *
 * TypeScript client functions to call the Session API endpoints.
 * Also includes test functions to verify all endpoints work correctly.
 *
 * Run: bun run apps/session-api-client.ts
 */

const API_BASE = "http://localhost:3456";
const DEFAULT_MODEL = "github-copilot/gemini-3-flash-preview";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Client Functions ─────────────────────────────────────────────────────────

/**
 * Start a new session or continue an existing one
 */
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

/**
 * List all tracked sessions
 */
export async function listSessions(): Promise<ListSessionsResponse> {
  const res = await fetch(`${API_BASE}/sessions`);
  return res.json();
}

/**
 * Get latest updates for a session
 */
export async function getSessionUpdates(sessionId: string): Promise<GetUpdatesResponse> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/updates`);
  return res.json();
}

// ─── Test Functions ───────────────────────────────────────────────────────────

async function testListSessions(): Promise<void> {
  console.log("\n═══ TEST: List Sessions ═══");
  const result = await listSessions();
  console.log("Sessions:", JSON.stringify(result, null, 2));
}

async function testStartNewSession(): Promise<string | null> {
  console.log("\n═══ TEST: Start New Session ═══");
  const result = await startSession(
    "Say hello and tell me what 2+2 equals",
    undefined,
    "opencode/minimax-m2.5-free"
  );
  console.log("Result:", JSON.stringify(result, null, 2));

  if (result.success) {
    return result.sessionId;
  }
  return null;
}

async function testGetUpdates(sessionId: string): Promise<void> {
  console.log("\n═══ TEST: Get Session Updates ═══");
  const result = await getSessionUpdates(sessionId);
  console.log("Updates:", JSON.stringify(result, null, 2));
}

async function testContinueSession(sessionId: string): Promise<void> {
  console.log("\n═══ TEST: Continue Existing Session ═══");
  const result = await startSession(
    "Now tell me what 3+3 equals",
    sessionId,
    "opencode/minimax-m2.5-free"
  );
  console.log("Result:", JSON.stringify(result, null, 2));
}

async function testContinueRunningSession(sessionId: string): Promise<void> {
  console.log("\n═══ TEST: Continue Running Session (should fail) ═══");
  const result = await startSession("This should fail because session is running", sessionId);
  console.log("Result:", JSON.stringify(result, null, 2));
}

async function testInvalidSession(): Promise<void> {
  console.log("\n═══ TEST: Invalid Session ID (should fail) ═══");
  const result = await startSession("This should fail", "ses_invalid_id_12345");
  console.log("Result:", JSON.stringify(result, null, 2));
}

async function testGetUpdatesInvalid(): Promise<void> {
  console.log("\n═══ TEST: Get Updates Invalid Session (should fail) ═══");
  const result = await getSessionUpdates("ses_invalid_id_12345");
  console.log("Result:", JSON.stringify(result, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Session API Client Tests");
  console.log("========================");
  console.log(`API Base: ${API_BASE}`);

  try {
    // Test 1: List existing sessions
    await testListSessions();

    // Test 2: Start a new session
    const newSessionId = await testStartNewSession();

    if (newSessionId) {
      // Wait a bit for the session to start processing
      console.log("\n[waiting 3s for session to process...]");
      await new Promise(r => setTimeout(r, 3000));

      // Test 3: Get updates on the new session
      await testGetUpdates(newSessionId);

      // Test 4: Try to continue a running session (should fail)
      await testContinueRunningSession(newSessionId);
    }

    // Test 5: Try invalid session ID
    await testInvalidSession();

    // Test 6: Get updates for invalid session
    await testGetUpdatesInvalid();

    // Test 7: List sessions again to see new session
    await testListSessions();

    console.log("\n═══ ALL TESTS COMPLETED ═══\n");
  } catch (error) {
    console.error("Test error:", error);
    process.exit(1);
  }
}

main();
