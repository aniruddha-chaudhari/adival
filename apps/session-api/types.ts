export type SessionLifecycle = "running" | "finished";

export type SessionEntry = {
  id: string;
  title: string;
  status: SessionLifecycle;
  lastUpdated: string;
  exportedAt: string | null;
};

export type SessionsIndex = {
  sessions: SessionEntry[];
  lastUpdated: string;
};

export type ExportedSession = {
  info: {
    id: string;
    title: string;
    directory: string;
    time: { created: number; updated: number };
  };
  messages: Array<{
    info: { role: string };
    parts: Array<{
      type: string;
      text?: string;
      tool?: string;
      state?: {
        status?: string;
        title?: string;
      };
    }>;
  }>;
};
