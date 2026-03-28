import type { Plugin } from "@opencode-ai/plugin";
import { basename, dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ENABLE_PLUGIN = true;
const TARGET_DIRECTORY_NAME = "adival";
const SESSIONS_JSON_PATH = "manager/sessions.json";

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

async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

async function readSessionsIndex(filePath: string): Promise<SessionsIndex> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as SessionsIndex;
  } catch {
    return { sessions: [], lastUpdated: new Date().toISOString() };
  }
}

async function writeSessionsIndex(filePath: string, index: SessionsIndex): Promise<void> {
  await ensureDir(filePath);
  index.lastUpdated = new Date().toISOString();
  await writeFile(filePath, JSON.stringify(index, null, 2), "utf8");
}

function getSessionInfo(result: any): any {
  if (!result) return undefined;
  if (result.data) return result.data;
  return result;
}

function findSessionIDDeep(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";

  if (typeof value === "string") {
    const match = value.match(/ses_[A-Za-z0-9]+/);
    return match ? match[0] : "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionIDDeep(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const direct = [row.id, row.sessionID, row.sessionId].find(
      v => typeof v === "string" && /^ses_[A-Za-z0-9]+$/.test(v)
    );
    if (typeof direct === "string") return direct;

    for (const nested of Object.values(row)) {
      const found = findSessionIDDeep(nested, depth + 1);
      if (found) return found;
    }
  }

  return "";
}

function getSessionIDFromEvent(event: any): string {
  const props = (event?.properties as any) || {};
  const info = props.info || {};

  return (
    info.id ||
    info.sessionID ||
    info.sessionId ||
    props.sessionID ||
    props.sessionId ||
    props.id ||
    props.session?.id ||
    info.session?.id ||
    findSessionIDDeep(props) ||
    ""
  );
}

async function fetchSession(client: any, sessionID: string, directory: string): Promise<any> {
  try {
    const result = await client.session.get({ sessionID, directory });
    return getSessionInfo(result);
  } catch {
    try {
      const result = await client.session.get({
        path: { id: sessionID },
        query: { directory },
      });
      return getSessionInfo(result);
    } catch {
      try {
        const result = await client.session.get({
          path: { id: sessionID },
        });
        return getSessionInfo(result);
      } catch {
        return null;
      }
    }
  }
}

export const SessionTracker: Plugin = async ({ client, directory }) => {
  if (!ENABLE_PLUGIN) {
    return { event: async () => {} };
  }

  const sessionsFilePath = join(directory, SESSIONS_JSON_PATH);
  const inFlightBySession = new Map<string, Promise<void>>();

  return {
    event: async ({ event }) => {
      const isCreated = event.type === "session.created";
      const isUpdated = event.type === "session.updated";
      const isIdle = event.type === "session.idle";

      if (!isCreated && !isUpdated && !isIdle) return;

      const sessionID = getSessionIDFromEvent(event);

      if (!sessionID) return;

      const previous = inFlightBySession.get(sessionID) || Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          try {
            let session = isUpdated
              ? event.properties?.info
              : await fetchSession(client as any, sessionID, directory);

            if (!session || !session.directory || !session.title) {
              const hydrated = await fetchSession(client as any, sessionID, directory);
              if (hydrated) {
                session = { ...hydrated, ...session };
              }
            }

            if (!session) return;

            // Filter to current project only
            if (basename(session.directory || "") !== TARGET_DIRECTORY_NAME) return;

            const index = await readSessionsIndex(sessionsFilePath);
            const existingIndex = index.sessions.findIndex(s => s.id === sessionID);
            const now = new Date().toISOString();

            const newStatus: "running" | "finished" = isIdle ? "finished" : "running";

            const entry: SessionEntry = {
              id: sessionID,
              title: session.title || "Untitled",
              status: newStatus,
              lastUpdated: now,
              exportedAt: existingIndex >= 0 ? index.sessions[existingIndex].exportedAt : null,
            };

            if (existingIndex >= 0) {
              index.sessions[existingIndex] = entry;
            } else {
              index.sessions.unshift(entry);
            }

            await writeSessionsIndex(sessionsFilePath, index);
          } catch (error) {
            // Silently ignore errors to avoid breaking the session
            console.error("[session-tracker] Error:", error);
          }
        })
        .finally(() => {
          if (inFlightBySession.get(sessionID) === next) {
            inFlightBySession.delete(sessionID);
          }
        });

      inFlightBySession.set(sessionID, next);
      await next;
    },
  };
};

export default SessionTracker;
