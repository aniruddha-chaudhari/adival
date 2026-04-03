import { DurableObject } from 'cloudflare:workers';

type Json = Record<string, unknown>;

type CommandMessage = {
	type: 'command';
	id: string;
	action: string;
	payload: unknown;
};

type ResultMessage = {
	type: 'result';
	id: string;
	ok: boolean;
	data?: unknown;
	error?: string;
};

type NodeRow = {
	id: string;
	code: string;
	name: string;
	leader_id: string | null;
	token_hash: string;
	last_seen: number;
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function toHash(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((part) => part.toString(16).padStart(2, '0'))
		.join('');
}

function randomCode(length = 8): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let result = '';
	for (let index = 0; index < length; index += 1) {
		result += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return result;
}

function authToken(request: Request): string | null {
	const value = request.headers.get('authorization') || '';
	if (value.toLowerCase().startsWith('bearer ')) {
		return value.slice(7).trim() || null;
	}
	const url = new URL(request.url);
	return url.searchParams.get('token');
}

async function readJson<T>(request: Request): Promise<T | null> {
	try {
		return (await request.json()) as T;
	} catch {
		return null;
	}
}

async function getHubStub(env: Env): Promise<DurableObjectStub<NetworkHub>> {
	const id = env.NETWORK_HUB.idFromName('global-network-hub');
	return env.NETWORK_HUB.get(id);
}

async function forwardToHub(request: Request, env: Env, internalPath: string): Promise<Response> {
	const url = new URL(request.url);
	const next = new URL(`https://network-hub${internalPath}`);
	next.search = url.search;
	const hub = await getHubStub(env);
	const forwarded = new Request(next.toString(), request);
	return hub.fetch(forwarded);
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/health') {
			return json({ ok: true });
		}

		if (request.method === 'POST' && url.pathname === '/network/register') {
			return forwardToHub(request, env, '/internal/network/register');
		}

		if (request.method === 'GET' && url.pathname.startsWith('/network/list/')) {
			const nodeId = url.pathname.slice('/network/list/'.length);
			return forwardToHub(request, env, `/internal/network/list/${encodeURIComponent(nodeId)}`);
		}

		if (request.method === 'POST' && url.pathname === '/network/elect') {
			return forwardToHub(request, env, '/internal/network/elect');
		}

		if (request.method === 'GET' && url.pathname.startsWith('/network/followers/')) {
			const leaderId = url.pathname.slice('/network/followers/'.length);
			return forwardToHub(request, env, `/internal/network/followers/${encodeURIComponent(leaderId)}`);
		}

		if (request.method === 'POST' && url.pathname === '/network/command') {
			return forwardToHub(request, env, '/internal/network/command');
		}

		if (request.method === 'POST' && url.pathname === '/network/session-updates') {
			return forwardToHub(request, env, '/internal/network/session-updates');
		}

		if (request.method === 'GET' && url.pathname.startsWith('/network/commands/')) {
			const nodeId = url.pathname.slice('/network/commands/'.length);
			return forwardToHub(request, env, `/internal/network/commands/${encodeURIComponent(nodeId)}`);
		}

		if (request.method === 'GET' && url.pathname === '/ws/node') {
			return forwardToHub(request, env, '/internal/ws/node');
		}

		return json({ success: false, error: 'Not found' }, 404);
	},
} satisfies ExportedHandler<Env>;

export class NetworkHub extends DurableObject<Env> {
	private readonly sockets = new Map<string, WebSocket>();
	private readonly pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: number;
		}
	>();
	private readonly sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        leader_id TEXT,
        token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `);
		this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_leader_id ON nodes (leader_id);`);
		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        leader_id TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT,
        result_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/internal/network/register') {
			return this.handleRegister(request);
		}

		if (request.method === 'GET' && url.pathname.startsWith('/internal/network/list/')) {
			return this.handleList(request, decodeURIComponent(url.pathname.slice(23)));
		}

		if (request.method === 'POST' && url.pathname === '/internal/network/elect') {
			return this.handleElect(request);
		}

		if (request.method === 'GET' && url.pathname.startsWith('/internal/network/followers/')) {
			return this.handleFollowers(request, decodeURIComponent(url.pathname.slice(28)), url.searchParams);
		}

		if (request.method === 'POST' && url.pathname === '/internal/network/command') {
			return this.handleCommand(request);
		}

		if (request.method === 'POST' && url.pathname === '/internal/network/session-updates') {
			return this.handleSessionUpdates(request);
		}

		if (request.method === 'GET' && url.pathname.startsWith('/internal/network/commands/')) {
			return this.handleCommandLogs(request, decodeURIComponent(url.pathname.slice(27)), url.searchParams);
		}

		if (request.method === 'GET' && url.pathname === '/internal/ws/node') {
			return this.handleWebSocket(request);
		}

		return json({ success: false, error: 'Not found' }, 404);
	}

	private getNodeById(id: string): NodeRow | null {
		const rows = this.sql.exec<NodeRow>(`SELECT id, code, name, leader_id, token_hash, last_seen FROM nodes WHERE id = ?`, id).toArray();
		return rows[0] || null;
	}

	private getNodeByCode(code: string): NodeRow | null {
		const rows = this.sql
			.exec<NodeRow>(`SELECT id, code, name, leader_id, token_hash, last_seen FROM nodes WHERE code = ?`, code)
			.toArray();
		return rows[0] || null;
	}

	private async authenticate(request: Request, expectedNodeId?: string): Promise<string | null> {
		const token = authToken(request);
		if (!token) return null;
		const hash = await toHash(token);

		const rows = this.sql.exec<{ id: string }>(`SELECT id FROM nodes WHERE token_hash = ?`, hash).toArray();
		const row = rows[0];
		if (!row?.id) return null;
		if (expectedNodeId && row.id !== expectedNodeId) return null;
		return row.id;
	}

	private async handleRegister(request: Request): Promise<Response> {
		const body = await readJson<{ name?: string; code?: string }>(request);
		const name = String(body?.name || '').trim();
		if (!name) {
			return json({ success: false, error: 'name is required' }, 400);
		}

		const now = Date.now();
		const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
		const tokenHash = await toHash(token);

		let nodeId = '';
		let code = String(body?.code || '')
			.trim()
			.toUpperCase();
		let leaderId: string | null = null;

		if (code) {
			const existing = this.getNodeByCode(code);
			if (existing?.id) {
				nodeId = String(existing.id);
				leaderId = existing.leader_id ? String(existing.leader_id) : null;
				this.sql.exec(
					`UPDATE nodes SET name = ?, token_hash = ?, updated_at = ?, last_seen = ? WHERE id = ?`,
					name,
					tokenHash,
					now,
					now,
					nodeId,
				);
			}
		}

		if (!nodeId) {
			nodeId = crypto.randomUUID();
			while (!code || this.getNodeByCode(code)) {
				code = randomCode(8);
			}
			this.sql.exec(
				`INSERT INTO nodes (id, code, name, leader_id, token_hash, created_at, updated_at, last_seen)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
				nodeId,
				code,
				name,
				tokenHash,
				now,
				now,
				now,
			);
		}

		return json({
			success: true,
			nodeId,
			code,
			leaderId,
			relayToken: token,
		});
	}

	private async handleList(request: Request, nodeId: string): Promise<Response> {
		const authedNodeId = await this.authenticate(request, nodeId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const rows = this.sql
			.exec<{
				id: string;
				code: string;
				name: string;
				leader_id: string | null;
			}>(
				`SELECT id, code, name, leader_id FROM nodes WHERE id != ? AND (leader_id IS NULL OR leader_id != ?) ORDER BY name ASC`,
				nodeId,
				nodeId,
			)
			.toArray();

		return json({
			success: true,
			nodes: rows.map((row) => ({
				id: row.id,
				code: row.code,
				name: row.name,
				hasLeader: !!row.leader_id,
				online: this.sockets.has(row.id),
			})),
		});
	}

	private async handleElect(request: Request): Promise<Response> {
		const body = await readJson<{ nodeId?: string; leaderCode?: string }>(request);
		const nodeId = String(body?.nodeId || '').trim();
		const leaderCode = String(body?.leaderCode || '')
			.trim()
			.toUpperCase();
		if (!nodeId || !leaderCode) {
			return json({ success: false, error: 'nodeId and leaderCode are required' }, 400);
		}

		const authedNodeId = await this.authenticate(request, nodeId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const node = this.getNodeById(nodeId);
		if (!node) {
			return json({ success: false, error: 'node not found' }, 404);
		}

		const leader = this.getNodeByCode(leaderCode);
		if (!leader?.id) {
			return json({ success: false, error: 'leader not found' }, 404);
		}

		if (String(leader.id) === nodeId) {
			return json({ success: false, error: 'node cannot elect itself' }, 400);
		}

		this.sql.exec(`UPDATE nodes SET leader_id = ?, updated_at = ? WHERE id = ?`, String(leader.id), Date.now(), nodeId);
		return json({ success: true, leaderId: String(leader.id), leaderCode });
	}

	private async handleFollowers(request: Request, leaderId: string, searchParams: URLSearchParams): Promise<Response> {
		const authedNodeId = await this.authenticate(request, leaderId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const onlineOnly = searchParams.get('online') === 'true';
		const rows = this.sql
			.exec<{ id: string; code: string; name: string }>(`SELECT id, code, name FROM nodes WHERE leader_id = ? ORDER BY name ASC`, leaderId)
			.toArray();

		const followers = rows
			.map((row) => ({
				id: row.id,
				code: row.code,
				name: row.name,
				online: this.sockets.has(row.id),
			}))
			.filter((row) => (onlineOnly ? row.online : true));

		return json({ success: true, followers });
	}

	private sendCommandToNode(targetNodeId: string, action: string, payload: unknown, timeoutMs = 30_000): Promise<unknown> {
		const socket = this.sockets.get(targetNodeId);
		if (!socket) {
			throw new Error('target follower is offline');
		}

		const commandId = crypto.randomUUID();
		const message: CommandMessage = {
			type: 'command',
			id: commandId,
			action,
			payload,
		};

		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(commandId);
				reject(new Error('command timed out'));
			}, timeoutMs) as unknown as number;

			this.pending.set(commandId, { resolve, reject, timer });

			try {
				socket.send(JSON.stringify(message));
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(commandId);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private async dispatchFollowerCommand(options: {
		leaderId: string;
		targetNodeId: string;
		action: string;
		payload: unknown;
		trackCommand?: boolean;
	}): Promise<unknown> {
		const { leaderId, targetNodeId, action, payload, trackCommand = true } = options;

		let commandId = '';
		if (trackCommand) {
			commandId = crypto.randomUUID();
			const now = Date.now();
			this.sql.exec(
				`INSERT INTO commands (id, leader_id, target_node_id, action, status, payload_json, result_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'dispatched', ?, NULL, ?, ?)`,
				commandId,
				leaderId,
				targetNodeId,
				action,
				JSON.stringify(payload ?? null),
				now,
				now,
			);
		}

		try {
			const result = await this.sendCommandToNode(targetNodeId, action, payload);
			if (trackCommand && commandId) {
				this.sql.exec(
					`UPDATE commands SET status = 'completed', result_json = ?, updated_at = ? WHERE id = ?`,
					JSON.stringify(result),
					Date.now(),
					commandId,
				);
			}
			return result;
		} catch (error) {
			if (trackCommand && commandId) {
				const messageText = error instanceof Error ? error.message : String(error);
				this.sql.exec(
					`UPDATE commands SET status = 'failed', result_json = ?, updated_at = ? WHERE id = ?`,
					JSON.stringify({ error: messageText }),
					Date.now(),
					commandId,
				);
			}
			throw error;
		}
	}

	private async handleCommand(request: Request): Promise<Response> {
		const body = await readJson<{
			leaderId?: string;
			targetNodeId?: string;
			action?: string;
			payload?: unknown;
		}>(request);

		const leaderId = String(body?.leaderId || '').trim();
		const targetNodeId = String(body?.targetNodeId || '').trim();
		const action = String(body?.action || '').trim();

		if (!leaderId || !targetNodeId || !action) {
			return json({ success: false, error: 'leaderId, targetNodeId, action are required' }, 400);
		}

		const authedNodeId = await this.authenticate(request, leaderId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const targetRows = this.sql
			.exec<{ id: string }>(`SELECT id FROM nodes WHERE id = ? AND leader_id = ?`, targetNodeId, leaderId)
			.toArray();
		if (!targetRows[0]?.id) {
			return json({ success: false, error: 'target is not your follower' }, 403);
		}

		try {
			const result = await this.dispatchFollowerCommand({
				leaderId,
				targetNodeId,
				action,
				payload: body?.payload ?? null,
				trackCommand: true,
			});
			return json({ success: true, result });
		} catch (error) {
			const messageText = error instanceof Error ? error.message : String(error);
			const statusCode = messageText === 'target follower is offline' ? 409 : 504;
			return json({ success: false, error: messageText }, statusCode);
		}
	}

	private async handleSessionUpdates(request: Request): Promise<Response> {
		const body = await readJson<{ leaderId?: string; sessionId?: string }>(request);
		const leaderId = String(body?.leaderId || '').trim();
		const sessionId = String(body?.sessionId || '').trim();

		if (!leaderId || !sessionId) {
			return json({ success: false, error: 'leaderId and sessionId are required' }, 400);
		}

		const authedNodeId = await this.authenticate(request, leaderId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const followers = this.sql
			.exec<{ id: string }>(`SELECT id FROM nodes WHERE leader_id = ? ORDER BY name ASC`, leaderId)
			.toArray()
			.map((row) => row.id)
			.filter((id) => this.sockets.has(id));

		for (const followerId of followers) {
			try {
				const existsResult = (await this.dispatchFollowerCommand({
					leaderId,
					targetNodeId: followerId,
					action: 'session.exists',
					payload: { sessionId },
					trackCommand: false,
				})) as { success?: boolean; exists?: boolean };

				if (!existsResult?.exists) {
					continue;
				}

				const updates = await this.dispatchFollowerCommand({
					leaderId,
					targetNodeId: followerId,
					action: 'session.updates',
					payload: { sessionId },
					trackCommand: true,
				});

				return json(updates);
			} catch {
				// Try next follower.
			}
		}

		return json({ success: false, error: 'Session not found' }, 404);
	}

	private async handleCommandLogs(request: Request, nodeId: string, searchParams: URLSearchParams): Promise<Response> {
		const authedNodeId = await this.authenticate(request, nodeId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const parsedLimit = Number(searchParams.get('limit') || '20');
		const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 20;

		const rows = this.sql
			.exec<{
				id: string;
				leader_id: string;
				target_node_id: string;
				action: string;
				status: string;
				payload_json: string | null;
				result_json: string | null;
				created_at: number;
				updated_at: number;
			}>(
				`SELECT id, leader_id, target_node_id, action, status, payload_json, result_json, created_at, updated_at
				 FROM commands
				 WHERE leader_id = ? OR target_node_id = ?
				 ORDER BY created_at DESC
				 LIMIT ?`,
				nodeId,
				nodeId,
				limit,
			)
			.toArray();

		return json({
			success: true,
			logs: rows.map((row) => ({
				id: row.id,
				leaderId: row.leader_id,
				targetNodeId: row.target_node_id,
				action: row.action,
				status: row.status,
				payload: row.payload_json ? JSON.parse(row.payload_json) : null,
				result: row.result_json ? JSON.parse(row.result_json) : null,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			})),
		});
	}

	private async handleWebSocket(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return json({ success: false, error: 'Expected websocket' }, 426);
		}

		const url = new URL(request.url);
		const nodeId = String(url.searchParams.get('nodeId') || '').trim();
		if (!nodeId) {
			return json({ success: false, error: 'nodeId is required' }, 400);
		}

		const authedNodeId = await this.authenticate(request, nodeId);
		if (!authedNodeId) {
			return json({ success: false, error: 'unauthorized' }, 401);
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();

		const previousSocket = this.sockets.get(nodeId);
		if (previousSocket) {
			try {
				previousSocket.close(1000, 'replaced');
			} catch {
				// Ignore cleanup errors.
			}
		}
		this.sockets.set(nodeId, server);
		this.sql.exec(`UPDATE nodes SET last_seen = ?, updated_at = ? WHERE id = ?`, Date.now(), Date.now(), nodeId);

		server.addEventListener('message', (event) => {
			try {
				const parsed = JSON.parse(String(event.data)) as Json;
				if (parsed.type === 'heartbeat') {
					this.sql.exec(`UPDATE nodes SET last_seen = ?, updated_at = ? WHERE id = ?`, Date.now(), Date.now(), nodeId);
					return;
				}

				if (parsed.type === 'result' && typeof parsed.id === 'string') {
					const pending = this.pending.get(parsed.id);
					if (!pending) return;
					clearTimeout(pending.timer);
					this.pending.delete(parsed.id);
					const resultPayload = parsed as unknown as ResultMessage;
					if (!resultPayload.ok) {
						pending.reject(new Error(resultPayload.error || 'command failed'));
						return;
					}
					pending.resolve(resultPayload.data ?? null);
				}
			} catch {
				// Ignore malformed messages.
			}
		});

		server.addEventListener('close', () => {
			if (this.sockets.get(nodeId) === server) {
				this.sockets.delete(nodeId);
			}
			this.sql.exec(`UPDATE nodes SET last_seen = ?, updated_at = ? WHERE id = ?`, Date.now(), Date.now(), nodeId);
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
