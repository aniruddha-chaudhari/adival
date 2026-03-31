import { Hono } from "hono";
import { cors } from "hono/cors";
import type { RelayClient } from "./relay-client.ts";
import type { SessionService } from "./session-service.ts";
import type { SessionSummary, StartSessionResponse } from "./types.ts";

type SessionStartBody = {
  sessionId?: string;
  prompt: string;
  model?: string;
  clientId?: string;
};

type ElectBody = {
  leaderCode: string;
};

export function buildCommandExecutor(service: SessionService) {
  return async (action: string, payload: unknown): Promise<unknown> => {
    if (action === "sessions.list") {
      const sessions = await service.listLocalSessions();
      return { sessions };
    }

    if (action === "session.start") {
      const body = (payload || {}) as { sessionId?: string; prompt?: string; model?: string };
      if (!body.prompt?.trim()) {
        return { success: false, error: "prompt is required" };
      }
      return service.startLocalSession({
        sessionId: body.sessionId,
        prompt: body.prompt,
        model: body.model,
      });
    }

    throw new Error(`Unsupported action: ${action}`);
  };
}

export function buildApp(options: {
  service: SessionService;
  relayClient: RelayClient;
  nodeId: string;
}) {
  const app = new Hono();
  app.use("*", cors());

  app.get("/network/list", async c => {
    try {
      const nodes = await options.relayClient.listCandidates();
      return c.json({ success: true, nodes });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.post("/network/elect", async c => {
    try {
      const body = (await c.req.json()) as ElectBody;
      const leaderCode = body.leaderCode?.trim();
      if (!leaderCode) {
        return c.json({ success: false, error: "leaderCode is required" }, 400);
      }
      const result = await options.relayClient.electLeader(leaderCode);
      return c.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.get("/network/logs", async c => {
    try {
      const rawLimit = Number(c.req.query("limit") || "20");
      const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
      const logs = await options.relayClient.listCommandLogs(limit);
      return c.json({ success: true, logs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.post("/session/start", async c => {
    try {
      const body = (await c.req.json()) as SessionStartBody;
      const clientId = body.clientId?.trim();

      if (!clientId || clientId === options.nodeId) {
        const localResult = await options.service.startLocalSession({
          sessionId: body.sessionId,
          prompt: body.prompt,
          model: body.model,
        });
        const status = localResult.success ? 200 : 400;
        return c.json(localResult, status);
      }

      const remoteResult = await options.relayClient.sendCommand<StartSessionResponse>(
        clientId,
        "session.start",
        {
          sessionId: body.sessionId,
          prompt: body.prompt,
          model: body.model,
        }
      );

      const status = remoteResult.success ? 200 : 400;
      return c.json(remoteResult, status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.get("/sessions", async c => {
    try {
      const yourSessions = await options.service.listLocalSessions();
      const response: Record<string, SessionSummary[]> = { your: yourSessions };

      const followers = await options.relayClient.listOnlineFollowers(options.nodeId);
      for (const follower of followers) {
        try {
          const data = await options.relayClient.sendCommand<{ sessions: SessionSummary[] }>(
            follower.id,
            "sessions.list",
            {}
          );
          response[follower.id] = Array.isArray(data.sessions) ? data.sessions : [];
        } catch {
          // Skip followers that drop offline mid-request.
        }
      }

      return c.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.get("/session/:id/updates", async c => {
    try {
      const sessionId = c.req.param("id");
      const response = await options.service.getLocalSessionUpdates(sessionId);
      const status = response.success ? 200 : 404;
      return c.json(response, status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  return app;
}
