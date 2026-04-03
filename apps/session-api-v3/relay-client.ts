import type { NodeIdentity } from "./types.ts";

type RelayNode = {
  id: string;
  code: string;
  name: string;
  online: boolean;
  hasLeader: boolean;
};

type RelayFollower = {
  id: string;
  code: string;
  name: string;
  online: boolean;
};

export type RelayCommandLog = {
  id: string;
  leaderId: string;
  targetNodeId: string;
  action: string;
  status: string;
  payload: unknown;
  result: unknown;
  createdAt: number;
  updatedAt: number;
};

export type SessionUpdatesResponse =
  | {
      success: true;
      sessionId: string;
      title: string;
      status: "running" | "finished";
      latestContent: string;
    }
  | {
      success: false;
      error: string;
    };

async function parseJSON<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Relay request failed with status ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export class RelayClient {
  constructor(
    private readonly relayBaseUrl: string,
    private readonly identity: NodeIdentity
  ) {}

  get wsUrl(): string {
    const base = this.relayBaseUrl.replace(/^http/i, "ws");
    return `${base}/ws/node?nodeId=${encodeURIComponent(this.identity.nodeId)}&token=${encodeURIComponent(this.identity.relayToken)}`;
  }

  get relayToken(): string {
    return this.identity.relayToken;
  }

  get nodeId(): string {
    return this.identity.nodeId;
  }

  get leaderId(): string | null {
    return this.identity.leaderId;
  }

  setLeaderId(leaderId: string | null): void {
    this.identity.leaderId = leaderId;
  }

  async listCandidates(): Promise<RelayNode[]> {
    const res = await fetch(
      `${this.relayBaseUrl}/network/list/${encodeURIComponent(this.identity.nodeId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.identity.relayToken}`,
        },
      }
    );
    const parsed = await parseJSON<{ success: true; nodes: RelayNode[] }>(res);
    return parsed.nodes || [];
  }

  async electLeader(leaderCode: string): Promise<{ leaderId: string; leaderCode: string }> {
    const res = await fetch(`${this.relayBaseUrl}/network/elect`, {
      method: "POST",
      headers: authHeaders(this.identity.relayToken),
      body: JSON.stringify({ nodeId: this.identity.nodeId, leaderCode }),
    });
    const parsed = await parseJSON<{ success: true; leaderId: string; leaderCode: string }>(res);
    this.identity.leaderId = parsed.leaderId;
    return { leaderId: parsed.leaderId, leaderCode: parsed.leaderCode };
  }

  async listOnlineFollowers(leaderId: string): Promise<RelayFollower[]> {
    const res = await fetch(
      `${this.relayBaseUrl}/network/followers/${encodeURIComponent(leaderId)}?online=true`,
      {
        headers: {
          Authorization: `Bearer ${this.identity.relayToken}`,
        },
      }
    );
    const parsed = await parseJSON<{ success: true; followers: RelayFollower[] }>(res);
    return parsed.followers || [];
  }

  async sendCommand<T>(targetNodeId: string, action: string, payload: unknown): Promise<T> {
    const leaderId = this.identity.nodeId;
    const res = await fetch(`${this.relayBaseUrl}/network/command`, {
      method: "POST",
      headers: authHeaders(this.identity.relayToken),
      body: JSON.stringify({
        leaderId,
        targetNodeId,
        action,
        payload,
      }),
    });
    const parsed = await parseJSON<{ success: true; result: T }>(res);
    return parsed.result;
  }

  async listCommandLogs(limit = 20): Promise<RelayCommandLog[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const res = await fetch(
      `${this.relayBaseUrl}/network/commands/${encodeURIComponent(this.identity.nodeId)}?limit=${boundedLimit}`,
      {
        headers: {
          Authorization: `Bearer ${this.identity.relayToken}`,
        },
      }
    );
    const parsed = await parseJSON<{ success: true; logs: RelayCommandLog[] }>(res);
    return parsed.logs || [];
  }

  async reregisterName(name: string): Promise<NodeIdentity> {
    const nextIdentity = await registerNode({
      relayBaseUrl: this.relayBaseUrl,
      name,
      existingCode: this.identity.code,
    });

    this.identity.nodeId = nextIdentity.nodeId;
    this.identity.code = nextIdentity.code;
    this.identity.relayToken = nextIdentity.relayToken;
    this.identity.leaderId = nextIdentity.leaderId;
    this.identity.name = nextIdentity.name;

    return { ...this.identity };
  }

  async requestSessionUpdates(sessionId: string): Promise<SessionUpdatesResponse> {
    const res = await fetch(`${this.relayBaseUrl}/network/session-updates`, {
      method: "POST",
      headers: authHeaders(this.identity.relayToken),
      body: JSON.stringify({
        leaderId: this.identity.nodeId,
        sessionId,
      }),
    });
    return parseJSON<SessionUpdatesResponse>(res);
  }
}

export async function registerNode(options: {
  relayBaseUrl: string;
  name: string;
  existingCode?: string;
}): Promise<NodeIdentity> {
  const res = await fetch(`${options.relayBaseUrl}/network/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: options.name,
      code: options.existingCode,
    }),
  });

  const parsed = await parseJSON<{
    success: true;
    nodeId: string;
    code: string;
    relayToken: string;
    leaderId: string | null;
  }>(res);

  return {
    nodeId: parsed.nodeId,
    code: parsed.code,
    relayToken: parsed.relayToken,
    leaderId: parsed.leaderId,
    name: options.name,
  };
}
