export type SessionLifecycle = "running" | "finished";

export type SessionSummary = {
  id: string;
  title: string;
  status: SessionLifecycle;
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

export type NodeIdentity = {
  nodeId: string;
  code: string;
  relayToken: string;
  name: string;
  leaderId: string | null;
};

export type StartSessionSuccess = {
  success: true;
  sessionId: string;
  title: string;
  status: "running";
};

export type StartSessionError = {
  success: false;
  error: string;
};

export type StartSessionResponse = StartSessionSuccess | StartSessionError;
