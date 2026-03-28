import type { SessionStore } from "./store.ts";
import type { SessionExporter } from "./exporter.ts";
import { getSessionStatusMap } from "./sdk-helpers.ts";
import { FALLBACK_FINISH_STALE_MS } from "./config.ts";

type SessionStatusValue = { type: "idle" | "busy" | "retry"; [key: string]: unknown };
type SessionStatusMap = Record<string, SessionStatusValue | undefined>;

export class SessionSupervisor {
  private statusInterval: Timer | null = null;
  private exportIntervals = new Map<string, Timer>();
  private exportInFlight = new Map<string, Promise<void>>();
  private exportSignals = new Map<
    string,
    { lastUpdatedAt: number | null; stagnantSinceMs: number | null }
  >();
  private statusPollInFlight = false;
  private readonly fallbackFinishMs = FALLBACK_FINISH_STALE_MS;

  constructor(
    private readonly client: any,
    private readonly store: SessionStore,
    private readonly exporter: SessionExporter,
    private readonly directory: string,
    private readonly statusPollIntervalMs: number,
    private readonly exportPollIntervalMs: number
  ) {}

  async start(): Promise<void> {
    await this.recoverRunningSessions();
    this.statusInterval = setInterval(() => {
      void this.pollStatuses();
    }, this.statusPollIntervalMs);
    this.statusInterval.unref?.();
    await this.pollStatuses();
  }

  stop(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    for (const timer of this.exportIntervals.values()) {
      clearInterval(timer);
    }
    this.exportIntervals.clear();
  }

  async trackSession(sessionID: string, title: string): Promise<void> {
    await this.store.upsertRunning(sessionID, title);
    this.exportSignals.set(sessionID, { lastUpdatedAt: null, stagnantSinceMs: null });
    this.ensureExportLoop(sessionID);
    setTimeout(() => {
      void this.exportNow(sessionID);
    }, 0);
  }

  private async recoverRunningSessions(): Promise<void> {
    const sessions = await this.store.listSessions();
    for (const session of sessions) {
      if (session.status === "running") {
        this.exportSignals.set(session.id, { lastUpdatedAt: null, stagnantSinceMs: null });
        this.ensureExportLoop(session.id);
      }
    }
  }

  private ensureExportLoop(sessionID: string): void {
    if (this.exportIntervals.has(sessionID)) return;

    const timer = setInterval(() => {
      void this.exportNow(sessionID);
    }, this.exportPollIntervalMs);
    timer.unref?.();
    this.exportIntervals.set(sessionID, timer);
  }

  private clearExportLoop(sessionID: string): void {
    const timer = this.exportIntervals.get(sessionID);
    if (!timer) return;
    clearInterval(timer);
    this.exportIntervals.delete(sessionID);
    this.exportSignals.delete(sessionID);
  }

  private async exportNow(sessionID: string): Promise<void> {
    const previous = this.exportInFlight.get(sessionID) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const session = await this.store.getSession(sessionID);
        if (!session) return;
        try {
          const report = await this.exporter.exportSession(
            sessionID,
            session.status,
            session.title
          );
          await this.store.markExported(sessionID);

          if (session.status === "running") {
            const signal = this.exportSignals.get(sessionID) || {
              lastUpdatedAt: null,
              stagnantSinceMs: null,
            };

            if (report.hasActiveTool) {
              signal.stagnantSinceMs = null;
            } else if (signal.lastUpdatedAt === report.updatedAt) {
              signal.stagnantSinceMs = signal.stagnantSinceMs || Date.now();
            } else {
              signal.stagnantSinceMs = Date.now();
            }

            signal.lastUpdatedAt = report.updatedAt;
            this.exportSignals.set(sessionID, signal);

            const staleForMs = signal.stagnantSinceMs ? Date.now() - signal.stagnantSinceMs : 0;

            if (
              !report.hasActiveTool &&
              report.hasVisibleContent &&
              staleForMs >= this.fallbackFinishMs
            ) {
              await this.store.updateStatus(sessionID, "finished");
              await this.exporter.exportSession(sessionID, "finished", session.title);
              await this.store.markExported(sessionID);
              this.clearExportLoop(sessionID);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[api] Export failed for ${sessionID}: ${message}`);
        }
      })
      .finally(() => {
        if (this.exportInFlight.get(sessionID) === next) {
          this.exportInFlight.delete(sessionID);
        }
      });

    this.exportInFlight.set(sessionID, next);
    await next;
  }

  private async pollStatuses(): Promise<void> {
    if (this.statusPollInFlight) return;
    this.statusPollInFlight = true;

    try {
      const statusMap = (await getSessionStatusMap(
        this.client,
        this.directory
      )) as SessionStatusMap;
      const sessions = await this.store.listSessions();

      for (const session of sessions) {
        if (session.status !== "running") continue;
        const stateType = statusMap[session.id]?.type;

        if (stateType === "idle") {
          await this.store.updateStatus(session.id, "finished");
          await this.exportNow(session.id);
          this.clearExportLoop(session.id);
          continue;
        }

        this.ensureExportLoop(session.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] Status poll failed: ${message}`);
    } finally {
      this.statusPollInFlight = false;
    }
  }
}
