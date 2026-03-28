import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SessionStore } from "./store.ts";
import type { SessionExporter } from "./exporter.ts";
import type { SessionSupervisor } from "./supervisor.ts";
import { OPENCODE_BASE_URL, PROJECT_ROOT } from "./config.ts";

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

async function sendPromptAsyncRequest(options: {
  sessionID: string;
  prompt: string;
  model?: { providerID: string; modelID: string };
}): Promise<void> {
  const payload: Record<string, unknown> = {
    parts: [{ type: "text", text: options.prompt }],
  };
  if (options.model) payload.model = options.model;

  const url = `${OPENCODE_BASE_URL}/session/${encodeURIComponent(options.sessionID)}/prompt_async?directory=${encodeURIComponent(PROJECT_ROOT)}`;
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

export function buildApp(
  client: any,
  store: SessionStore,
  exporter: SessionExporter,
  supervisor: SessionSupervisor
) {
  const app = new Hono();
  app.use("*", cors());

  app.post("/session/start", async c => {
    try {
      const body = (await c.req.json()) as SessionStartBody;
      const prompt = body.prompt?.trim();
      if (!prompt) {
        return c.json({ success: false, error: "prompt is required" }, 400);
      }

      let targetSessionId = "";
      let title = "Untitled";

      if (body.sessionId) {
        const existing = await store.getSession(body.sessionId);
        if (!existing) {
          return c.json({ success: false, error: "Session not found" }, 404);
        }
        if (existing.status === "running") {
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

      await supervisor.trackSession(targetSessionId, title);

      void (async () => {
        try {
          await sendPromptAsyncRequest({
            sessionID: targetSessionId,
            model: toModel(body.model),
            prompt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[api] prompt_async failed for ${targetSessionId}: ${message}`);
          await store.updateStatus(targetSessionId, "finished");
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
      const sessions = await store.listSessions();
      return c.json({
        sessions: sessions.map(session => ({
          id: session.id,
          title: session.title,
          status: session.status,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.get("/session/:id/updates", async c => {
    try {
      const sessionId = c.req.param("id");
      const session = await store.getSession(sessionId);
      if (!session) {
        return c.json({ success: false, error: "Session not found" }, 404);
      }

      const latestContent = await exporter.readLatestTail(sessionId, 300);
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

  return app;
}
