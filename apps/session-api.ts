/**
 * Session API Server
 *
 * A Hono-based HTTP API for managing OpenCode sessions.
 * Provides endpoints to create/continue sessions, list sessions, and get updates.
 *
 * Run: bun run apps/session-api.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * IMPLEMENTATION PLAN
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ## Overview
 *
 * This API server wraps OpenCode's SDK to provide simple HTTP endpoints for
 * session management. It connects to the OpenCode server (spawns one if needed).
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  apps/session-api.ts                                                        │
 * │  Hono server on port 3456 (no CORS restrictions)                           │
 * │                                                                             │
 * │  On startup:                                                                │
 * │  1. Check if localhost:4096 is responding (OpenCode server)                │
 * │  2. If not → spawn `opencode serve` (fire-and-forget, don't manage close) │
 * │  3. Create SDK client pointing to localhost:4096                           │
 * │                                                                             │
 * │  Endpoints:                                                                 │
 * │  POST /session/start      → Create new or continue existing session        │
 * │  GET  /sessions           → List all sessions (id, title, status)          │
 * │  GET  /session/:id/updates → Get latest 300 chars of session markdown      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *          │
 *          │ SDK client (createOpencodeClient)
 *          ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  OpenCode Server (port 4096)                                                │
 * │  - Either existing TUI server                                              │
 * │  - Or spawned `opencode serve` from project root                           │
 * │  - Skills and plugins in .opencode/ folder work automatically              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Dependencies
 *
 * - hono: Web framework
 * - @opencode-ai/sdk: OpenCode SDK client
 * - manager/sessions.json: Session index (created by session-tracker plugin)
 * - manager/chats/*.md: Exported markdown files (created by session-exporter-daemon)
 *
 * ## Endpoints
 *
 * ### 1. POST /session/start
 *
 * Create a new session or continue an existing one.
 *
 * Request body:
 * ```json
 * {
 *   "sessionId": "ses_xxx",              // Optional - continue this session
 *   "prompt": "Do something",            // Required - message to send
 *   "model": "opencode/minimax-m2.5-free" // Optional - model override
 * }
 * ```
 *
 * Logic:
 * 1. Read manager/sessions.json
 * 2. If sessionId provided:
 *    - Check if session exists in sessions.json → if not, error
 *    - Check if status is "running" → if yes, error (can't continue running session)
 * 3. If no sessionId:
 *    - Create new session via SDK: POST /session
 * 4. Send prompt via SDK: POST /session/:id/prompt_async (non-blocking)
 * 5. Return immediately with session info
 *
 * Response (success):
 * ```json
 * {
 *   "success": true,
 *   "sessionId": "ses_xxx",
 *   "title": "Session title",
 *   "status": "running"
 * }
 * ```
 *
 * Response (error):
 * ```json
 * { "success": false, "error": "Session is already running" }
 * { "success": false, "error": "Session not found" }
 * ```
 *
 * ### 2. GET /sessions
 *
 * List all tracked sessions.
 *
 * Logic:
 * - Read manager/sessions.json
 * - Return sessions array with id, title, status only
 *
 * Response:
 * ```json
 * {
 *   "sessions": [
 *     { "id": "ses_xxx", "title": "Title", "status": "running" },
 *     { "id": "ses_yyy", "title": "Title 2", "status": "finished" }
 *   ]
 * }
 * ```
 *
 * ### 3. GET /session/:id/updates
 *
 * Get the latest content from a session's markdown export.
 *
 * Logic:
 * 1. Read manager/sessions.json to find session metadata
 * 2. Find markdown file in manager/chats/ matching pattern `*--{sessionId}.md`
 * 3. Read last 300 characters of file
 * 4. If file doesn't exist yet, return empty latestContent
 *
 * Response (success):
 * ```json
 * {
 *   "success": true,
 *   "sessionId": "ses_xxx",
 *   "title": "Session title",
 *   "status": "running",
 *   "latestContent": "...last 300 chars of markdown..."
 * }
 * ```
 *
 * Response (error):
 * ```json
 * { "success": false, "error": "Session not found" }
 * ```
 *
 * ## File Dependencies
 *
 * This API depends on files created by:
 *
 * 1. `.opencode/plugins/session-tracker.ts` - Plugin that tracks session events
 *    and updates manager/sessions.json with session status (running/finished)
 *
 * 2. `manager/tools/session-exporter-daemon.ts` - Background daemon that polls
 *    sessions.json and exports running sessions to manager/chats/*.md
 *
 * ## Session JSON Schema (manager/sessions.json)
 *
 * ```json
 * {
 *   "sessions": [
 *     {
 *       "id": "ses_abc123",
 *       "title": "Session title",
 *       "status": "running",           // or "finished"
 *       "lastUpdated": "2026-03-27T10:30:00.000Z",
 *       "exportedAt": "2026-03-27T10:30:05.000Z"  // or null
 *     }
 *   ],
 *   "lastUpdated": "2026-03-27T10:30:00.000Z"
 * }
 * ```
 *
 * ## OpenCode SDK Usage
 *
 * Key SDK methods used:
 * - client.session.create({ body: { title? } }) → Creates new session, returns Session with ID
 * - client.session.prompt({ path: { id }, body: { parts, model? } }) → Sends message, waits for response
 * - POST /session/:id/prompt_async → Sends message without waiting (returns 204)
 *
 * ## Startup Flow
 *
 * ```typescript
 * async function ensureOpencodeServer(): Promise<void> {
 *   const baseUrl = "http://127.0.0.1:4096";
 *
 *   // 1. Check if server is responding
 *   try {
 *     const res = await fetch(`${baseUrl}/global/health`);
 *     if (res.ok) return; // Already running
 *   } catch {}
 *
 *   // 2. Spawn opencode serve (fire and forget)
 *   Bun.spawn(["opencode", "serve"], {
 *     cwd: PROJECT_ROOT,
 *     stdout: "ignore",
 *     stderr: "ignore",
 *   });
 *
 *   // 3. Wait for server to be ready (poll health endpoint)
 *   for (let i = 0; i < 50; i++) {
 *     await sleep(100);
 *     try {
 *       const res = await fetch(`${baseUrl}/global/health`);
 *       if (res.ok) return;
 *     } catch {}
 *   }
 *
 *   throw new Error("Failed to start OpenCode server");
 * }
 * ```
 *
 * ## Testing
 *
 * Use apps/session-api-client.ts for testing:
 *
 * ```bash
 * # Terminal 1: Start the API server
 * bun run apps/session-api.ts
 *
 * # Terminal 2: Run tests
 * bun run apps/session-api-client.ts
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * END OF PLAN - IMPLEMENTATION BELOW
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPENCODE_PORT = 4096;
const OPENCODE_BASE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;
const API_PORT = 3456;
const SESSIONS_JSON_PATH = join(PROJECT_ROOT, "manager/sessions.json");
const CHATS_DIR = join(PROJECT_ROOT, "manager/chats");

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionEntry = {
  id: string;
  title: string;
  status: "running" | "finished";
  lastUpdated: string;
  exportedAt: string | null;
};

type SessionsIndex = {
  sessions: SessionEntry[];
  lastUpdated: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readSessionsIndex(): Promise<SessionsIndex> {
  try {
    const content = await readFile(SESSIONS_JSON_PATH, "utf8");
    return JSON.parse(content) as SessionsIndex;
  } catch {
    return { sessions: [], lastUpdated: new Date().toISOString() };
  }
}

async function findMarkdownFile(sessionId: string): Promise<string | null> {
  try {
    const files = await readdir(CHATS_DIR);
    const match = files.find(f => f.endsWith(`--${sessionId}.md`));
    return match ? join(CHATS_DIR, match) : null;
  } catch {
    return null;
  }
}

async function readLastChars(filePath: string, count: number): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.slice(-count);
  } catch {
    return "";
  }
}

async function ensureOpencodeServer(): Promise<void> {
  // Check if server is already responding
  try {
    const res = await fetch(`${OPENCODE_BASE_URL}/global/health`);
    if (res.ok) {
      console.log("[api] Connected to existing OpenCode server");
      return;
    }
  } catch {
    // Server not running
  }

  // Spawn opencode serve (fire and forget - don't manage close)
  console.log("[api] Starting OpenCode server...");
  Bun.spawn(["opencode", "serve"], {
    cwd: PROJECT_ROOT,
    stdout: "ignore",
    stderr: "ignore",
  });

  // Wait for server to be ready
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    try {
      const res = await fetch(`${OPENCODE_BASE_URL}/global/health`);
      if (res.ok) {
        console.log("[api] OpenCode server started");
        return;
      }
    } catch {
      // Keep trying
    }
  }

  throw new Error("Failed to start OpenCode server");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure OpenCode server is running
  await ensureOpencodeServer();

  // Create SDK client
  const client = createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
  });

  // Create Hono app with no CORS restrictions
  const app = new Hono();

  app.use("*", cors());

  // ─── POST /session/start ────────────────────────────────────────────────────

  app.post("/session/start", async c => {
    try {
      const body = await c.req.json();
      const { sessionId, prompt, model } = body as {
        sessionId?: string;
        prompt: string;
        model?: string;
      };

      if (!prompt) {
        return c.json({ success: false, error: "prompt is required" }, 400);
      }

      const index = await readSessionsIndex();
      let targetSessionId: string;
      let title: string;

      if (sessionId) {
        // Continue existing session
        const existing = index.sessions.find(s => s.id === sessionId);
        if (!existing) {
          return c.json({ success: false, error: "Session not found" }, 404);
        }
        if (existing.status === "running") {
          return c.json({ success: false, error: "Session is already running" }, 400);
        }
        targetSessionId = sessionId;
        title = existing.title;
      } else {
        // Create new session
        const result = await client.session.create({
          body: {},
        });
        const session = (result as any).data || result;
        targetSessionId = session.id;
        title = session.title || "New session";
      }

      // Send prompt asynchronously (non-blocking)
      const promptBody: any = {
        parts: [{ type: "text", text: prompt }],
      };
      if (model) {
        const [providerID, modelID] = model.includes("/") ? model.split("/", 2) : ["", model];
        promptBody.model = { providerID, modelID };
      }

      // Use fetch directly for prompt_async since SDK may not have it
      await fetch(`${OPENCODE_BASE_URL}/session/${targetSessionId}/prompt_async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptBody),
      });

      return c.json({
        success: true,
        sessionId: targetSessionId,
        title,
        status: "running",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  // ─── GET /sessions ──────────────────────────────────────────────────────────

  app.get("/sessions", async c => {
    try {
      const index = await readSessionsIndex();
      const sessions = index.sessions.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
      }));
      return c.json({ sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  // ─── GET /session/:id/updates ───────────────────────────────────────────────

  app.get("/session/:id/updates", async c => {
    try {
      const sessionId = c.req.param("id");
      const index = await readSessionsIndex();
      const session = index.sessions.find(s => s.id === sessionId);

      if (!session) {
        return c.json({ success: false, error: "Session not found" }, 404);
      }

      const mdFile = await findMarkdownFile(sessionId);
      const latestContent = mdFile ? await readLastChars(mdFile, 300) : "";

      return c.json({
        success: true,
        sessionId: session.id,
        title: session.title,
        status: session.status,
        latestContent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  // ─── Start Server ───────────────────────────────────────────────────────────

  console.log(`[api] Session API running on http://localhost:${API_PORT}`);
  console.log(`[api] Endpoints:`);
  console.log(`[api]   POST /session/start     - Create or continue session`);
  console.log(`[api]   GET  /sessions          - List all sessions`);
  console.log(`[api]   GET  /session/:id/updates - Get latest content`);

  Bun.serve({
    port: API_PORT,
    fetch: app.fetch,
  });
}

main().catch(error => {
  console.error("[api] Fatal error:", error);
  process.exit(1);
});
