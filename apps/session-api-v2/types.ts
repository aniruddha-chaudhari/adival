export type SessionLifecycle = "running" | "finished";

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

export type SessionSummary = {
  id: string;
  title: string;
  status: SessionLifecycle;
};
