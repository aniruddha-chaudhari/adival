import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SessionExporter } from "./exporter.ts";
import { OPENCODE_BASE_URL, PROJECT_ROOT } from "./config.ts";
import type { SessionLifecycle, SessionSummary } from "./types.ts";

type SessionStatusValue = { type: "idle" | "busy" | "retry"; [key: string]: unknown };
type SessionStatusMap = Record<string, SessionStatusValue | undefined>;

function unwrap<T>(result: any): T {
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new Error(JSON.stringify(result.error));
  }
  return (result?.data || result) as T;
}

function toModel(model?: string): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined;
  const [providerID, modelID] = model.includes("/") ? model.split("/", 2) : ["", model];
  if (!modelID) return undefined;
  return { providerID, modelID };
}

function withDirectory(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}directory=${encodeURIComponent(PROJECT_ROOT)}`;
}

async function fetchOpencodeJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${OPENCODE_BASE_URL}${withDirectory(path)}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${path} failed with status ${response.status}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function getSessionStatusMap(): Promise<SessionStatusMap> {
  return fetchOpencodeJSON<SessionStatusMap>("/session/status");
}

async function getSessionDetails(sessionID: string): Promise<{ id: string; title: string } | null> {
  const response = await fetch(
    `${OPENCODE_BASE_URL}${withDirectory(`/session/${encodeURIComponent(sessionID)}`)}`
  );

  if (response.status === 404) {
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `session lookup failed with status ${response.status}`);
  }

  const parsed = text ? (JSON.parse(text) as { id: string; title: string }) : null;
  if (!parsed?.id) return null;
  return { id: parsed.id, title: parsed.title || "Untitled" };
}

function mapToLifecycle(statusMap: SessionStatusMap, sessionID: string): SessionLifecycle {
  const stateType = statusMap[sessionID]?.type;
  return stateType === "busy" || stateType === "retry" ? "running" : "finished";
}

async function sendPromptAsyncRequest(options: {
  sessionID: string;
  prompt: string;
  model?: { providerID: string; modelID: string };
}): Promise<void> {
  const payload: Record<string, unknown> = {
    parts: [{ type: "text", text: options.prompt }],
  };
  if (options.model) payload.model = options.model;

  const url = `${OPENCODE_BASE_URL}${withDirectory(
    `/session/${encodeURIComponent(options.sessionID)}/prompt_async`
  )}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `prompt_async failed with status ${response.status}`);
  }
}

type SessionStartBody = {
  sessionId?: string;
  prompt: string;
  model?: string;
};

export function buildApp(client: any, exporter: SessionExporter) {
  const app = new Hono();
  app.use("*", cors());

  app.post("/session/start", async c => {
    try {
      const body = (await c.req.json()) as SessionStartBody;
      const prompt = body.prompt?.trim();
      if (!prompt) {
        return c.json({ success: false, error: "prompt is required" }, 400);
      }

      const statusMap = await getSessionStatusMap();
      let targetSessionId = "";
      let title = "Untitled";

      if (body.sessionId) {
        const existing = await getSessionDetails(body.sessionId);
        if (!existing) {
          return c.json({ success: false, error: "Session not found" }, 404);
        }
        if (mapToLifecycle(statusMap, existing.id) === "running") {
          return c.json({ success: false, error: "Session is already running" }, 400);
        }
        targetSessionId = existing.id;
        title = existing.title;
      } else {
        const created = unwrap<any>(await client.session.create({ directory: PROJECT_ROOT }));
        targetSessionId = String(created.id || "");
        title = String(created.title || "Untitled");
      }

      if (!targetSessionId) {
        return c.json({ success: false, error: "Failed to resolve session ID" }, 500);
      }

      void (async () => {
        try {
          await sendPromptAsyncRequest({
            sessionID: targetSessionId,
            model: toModel(body.model),
            prompt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[api-v2] prompt_async failed for ${targetSessionId}: ${message}`);
        }
      })();

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

  app.get("/sessions", async c => {
    try {
      const [rawSessions, statusMap] = await Promise.all([
        fetchOpencodeJSON<Array<{ id: string; title?: string }>>("/session"),
        getSessionStatusMap(),
      ]);

      const sessions: SessionSummary[] = rawSessions.map(session => ({
        id: session.id,
        title: session.title || "Untitled",
        status: mapToLifecycle(statusMap, session.id),
      }));

      return c.json({ sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.get("/session/:id/updates", async c => {
    try {
      const sessionId = c.req.param("id");
      const session = await getSessionDetails(sessionId);
      if (!session) {
        return c.json({ success: false, error: "Session not found" }, 404);
      }

      const statusMap = await getSessionStatusMap();
      const status = mapToLifecycle(statusMap, session.id);

      await exporter.exportSession(session.id, status, session.title);
      const latestContent = await exporter.readLatestTail(session.id, 300);

      return c.json({
        success: true,
        sessionId: session.id,
        title: session.title,
        status,
        latestContent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  return app;
}
