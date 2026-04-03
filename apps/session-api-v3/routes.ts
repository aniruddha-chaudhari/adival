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

    if (action === "session.exists") {
      const body = (payload || {}) as { sessionId?: string };
      const sessionId = body.sessionId?.trim();
      if (!sessionId) {
        return { success: false, error: "sessionId is required", exists: false };
      }
      const exists = await service.hasLocalSession(sessionId);
      return { success: true, exists };
    }

    if (action === "session.updates") {
      const body = (payload || {}) as { sessionId?: string };
      const sessionId = body.sessionId?.trim();
      if (!sessionId) {
        return { success: false, error: "sessionId is required" };
      }
      return service.getLocalSessionUpdates(sessionId);
    }

    throw new Error(`Unsupported action: ${action}`);
  };
}

export function buildApp(options: {
  service: SessionService;
  relayClient: RelayClient;
  nodeId: string;
  onIdentityUpdated: (identity: {
    nodeId: string;
    code: string;
    relayToken: string;
    leaderId: string | null;
    name: string;
  }) => Promise<void>;
}) {
  const app = new Hono();
  app.use("*", cors());

  const toFollowerKey = (usedKeys: Set<string>, follower: { id: string; name: string }): string => {
    const base = (follower.name || "Follower").trim() || "Follower";
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return key;
  };

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

  app.post("/network/reregister-name", async c => {
    try {
      const body = (await c.req.json()) as { name?: string };
      const name = body.name?.trim();
      if (!name) {
        return c.json({ success: false, error: "name is required" }, 400);
      }

      const identity = await options.relayClient.reregisterName(name);
      await options.onIdentityUpdated(identity);

      return c.json({
        success: true,
        nodeId: identity.nodeId,
        code: identity.code,
        name: identity.name,
        leaderId: identity.leaderId,
      });
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
      const usedKeys = new Set<string>(["your"]);

      const followers = await options.relayClient.listOnlineFollowers(options.nodeId);
      for (const follower of followers) {
        try {
          const data = await options.relayClient.sendCommand<{ sessions: SessionSummary[] }>(
            follower.id,
            "sessions.list",
            {}
          );
          const followerKey = toFollowerKey(usedKeys, follower);
          response[followerKey] = Array.isArray(data.sessions) ? data.sessions : [];
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
      const localResponse = await options.service.getLocalSessionUpdates(sessionId);
      if (localResponse.success) {
        return c.json(localResponse, 200);
      }

      try {
        const remoteResponse = await options.relayClient.requestSessionUpdates(sessionId);
        const status = remoteResponse.success ? 200 : 404;
        return c.json(remoteResponse, status);
      } catch {
        return c.json(localResponse, 404);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: message }, 500);
    }
  });

  return app;
}
