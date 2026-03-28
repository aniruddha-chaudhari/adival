import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionEntry, SessionsIndex, SessionLifecycle } from "./types.ts";

function nowISO(): string {
  return new Date().toISOString();
}

export class SessionStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async ensureParentDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }

  async readIndex(): Promise<SessionsIndex> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as SessionsIndex;
      if (!Array.isArray(parsed.sessions)) {
        return { sessions: [], lastUpdated: nowISO() };
      }
      return parsed;
    } catch {
      return { sessions: [], lastUpdated: nowISO() };
    }
  }

  private async writeIndex(index: SessionsIndex): Promise<void> {
    await this.ensureParentDir();
    index.lastUpdated = nowISO();
    await writeFile(this.filePath, JSON.stringify(index, null, 2), "utf8");
  }

  private async mutate(mutator: (index: SessionsIndex) => void | Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const index = await this.readIndex();
      await mutator(index);
      await this.writeIndex(index);
    });
    await this.writeQueue;
  }

  async listSessions(): Promise<SessionEntry[]> {
    const index = await this.readIndex();
    return index.sessions;
  }

  async getSession(sessionID: string): Promise<SessionEntry | null> {
    const index = await this.readIndex();
    return index.sessions.find(session => session.id === sessionID) || null;
  }

  async upsertRunning(sessionID: string, title: string): Promise<void> {
    await this.mutate(index => {
      const existing = index.sessions.find(session => session.id === sessionID);
      if (existing) {
        existing.title = title || existing.title || "Untitled";
        existing.status = "running";
        existing.lastUpdated = nowISO();
        return;
      }

      index.sessions.unshift({
        id: sessionID,
        title: title || "Untitled",
        status: "running",
        lastUpdated: nowISO(),
        exportedAt: null,
      });
    });
  }

  async updateStatus(sessionID: string, status: SessionLifecycle): Promise<void> {
    await this.mutate(index => {
      const session = index.sessions.find(item => item.id === sessionID);
      if (!session) return;
      session.status = status;
      session.lastUpdated = nowISO();
    });
  }

  async markExported(sessionID: string): Promise<void> {
    await this.mutate(index => {
      const session = index.sessions.find(item => item.id === sessionID);
      if (!session) return;
      session.exportedAt = nowISO();
      session.lastUpdated = nowISO();
    });
  }
}
