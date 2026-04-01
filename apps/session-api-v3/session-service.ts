import type { SessionExporter } from "./exporter.ts";
import { OPENCODE_BASE_URL, PROJECT_ROOT } from "./config.ts";
import type { SessionLifecycle, SessionSummary, StartSessionResponse } from "./types.ts";

type SessionStatusValue = { type: "idle" | "busy" | "retry"; [key: string]: unknown };
type SessionStatusMap = Record<string, SessionStatusValue | undefined>;

type SessionStartInput = {
  sessionId?: string;
  prompt: string;
  model?: string;
};

type SessionDetails = {
  id: string;
  title: string;
  createdAt?: number;
};

function extractCreatedAt(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;

  const direct = root.created;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const time = root.time;
  if (time && typeof time === "object") {
    const created = (time as Record<string, unknown>).created;
    if (typeof created === "number" && Number.isFinite(created)) return created;
  }

  const info = root.info;
  if (info && typeof info === "object") {
    const createdFromInfo = extractCreatedAt(info);
    if (typeof createdFromInfo === "number") return createdFromInfo;
  }

  return undefined;
}

function isToday(timestamp: number): boolean {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return timestamp >= start && timestamp < end;
}

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

async function getSessionDetails(sessionID: string): Promise<SessionDetails | null> {
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

  const parsed = text ? (JSON.parse(text) as SessionDetails) : null;
  if (!parsed?.id) return null;
  return {
    id: parsed.id,
    title: parsed.title || "Untitled",
    createdAt: extractCreatedAt(parsed),
  };
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

export class SessionService {
  constructor(
    private readonly client: any,
    private readonly exporter: SessionExporter
  ) {}

  async startLocalSession(input: SessionStartInput): Promise<StartSessionResponse> {
    const prompt = input.prompt?.trim();
    if (!prompt) {
      return { success: false, error: "prompt is required" };
    }

    const statusMap = await getSessionStatusMap();
    let targetSessionId = "";
    let title = "Untitled";

    if (input.sessionId) {
      const existing = await getSessionDetails(input.sessionId);
      if (!existing) {
        return { success: false, error: "Session not found" };
      }
      if (mapToLifecycle(statusMap, existing.id) === "running") {
        return { success: false, error: "Session is already running" };
      }
      targetSessionId = existing.id;
      title = existing.title;
    } else {
      const created = unwrap<any>(await this.client.session.create({ directory: PROJECT_ROOT }));
      targetSessionId = String(created.id || "");
      title = String(created.title || "Untitled");
    }

    if (!targetSessionId) {
      return { success: false, error: "Failed to resolve session ID" };
    }

    void (async () => {
      try {
        await sendPromptAsyncRequest({
          sessionID: targetSessionId,
          model: toModel(input.model),
          prompt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[api-v3] prompt_async failed for ${targetSessionId}: ${message}`);
      }
    })();

    return {
      success: true,
      sessionId: targetSessionId,
      title,
      status: "running",
    };
  }

  async listLocalSessions(): Promise<SessionSummary[]> {
    const [rawSessions, statusMap] = await Promise.all([
      fetchOpencodeJSON<Array<{ id: string; title?: string }>>("/session"),
      getSessionStatusMap(),
    ]);

    const details = await Promise.all(rawSessions.map(session => getSessionDetails(session.id)));
    const allowedSessionIds = new Set(
      details
        .filter((detail): detail is SessionDetails => !!detail)
        .filter(detail => (typeof detail.createdAt === "number" ? isToday(detail.createdAt) : true))
        .map(detail => detail.id)
    );

    return rawSessions
      .filter(session => allowedSessionIds.has(session.id))
      .map(session => ({
        id: session.id,
        title: session.title || "Untitled",
        status: mapToLifecycle(statusMap, session.id),
      }));
  }

  async getLocalSessionUpdates(sessionId: string): Promise<
    | {
        success: true;
        sessionId: string;
        title: string;
        status: SessionLifecycle;
        latestContent: string;
      }
    | { success: false; error: string }
  > {
    const session = await getSessionDetails(sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const statusMap = await getSessionStatusMap();
    const status = mapToLifecycle(statusMap, session.id);
    await this.exporter.exportSession(session.id, status, session.title);
    const latestContent = await this.exporter.readLatestTail(session.id, 300);

    return {
      success: true,
      sessionId: session.id,
      title: session.title,
      status,
      latestContent,
    };
  }
}
