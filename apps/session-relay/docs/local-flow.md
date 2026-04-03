# Session Relay Local Flow

This document maps request and message flow for `apps/session-relay` (Cloudflare Worker + single global Durable Object + SQLite).

## 1) Relay Architecture

```text
HTTP request
  |
  v
Worker fetch handler (src/index.ts)
  |
  v
forwardToHub(...)
  |
  v
NetworkHub Durable Object (global instance)
  |
  +--> SQLite (nodes, commands)
  +--> in-memory sockets map
  +--> in-flight pending command map
```

Single DO instance is used via `idFromName("global-network-hub")`.

## 2) Data Model (DO SQLite)

### `nodes`

- `id` (primary key)
- `code` (unique leader/follower code)
- `name`
- `leader_id` (nullable)
- `token_hash` (auth)
- `created_at`, `updated_at`, `last_seen`

### `commands`

- `id` (command id)
- `leader_id`
- `target_node_id`
- `action`
- `status` (`dispatched`, `completed`, `failed`)
- `payload_json`, `result_json`
- timestamps

## 3) Public HTTP Route Flow

### `POST /network/register`

```text
name + optional code
  |
  +--> code exists -> resume node, rotate token
  +--> code missing/new -> create node + generate code
  |
  v
return { nodeId, code, relayToken, leaderId }
```

### `GET /network/list/:nodeId`

```text
auth token validate against nodeId
  |
  v
return nodes where:
  id != self
  AND (leader_id IS NULL OR leader_id != self)
```

### `POST /network/elect`

```text
auth + body { nodeId, leaderCode }
  |
  v
resolve leader by code
  |
  v
set nodes.leader_id for nodeId
```

### `GET /network/followers/:leaderId?online=true`

```text
auth as leaderId
  |
  v
select followers from DB
  |
  v
if online=true -> filter by sockets.has(nodeId)
```

### `POST /network/command`

```text
auth as leaderId
  |
  v
validate target_node_id belongs to leader_id
  |
  v
target online?
  | no -> 409
  | yes
  v
insert command row (dispatched)
  |
  v
send WS command to follower
  |
  +--> result received in time -> mark completed -> return result
  +--> timeout/error -> mark failed -> 504
```

### `POST /network/session-updates`

```text
auth as leaderId + body { leaderId, sessionId }
  |
  v
get online followers for leader
  |
  v
for each follower:
  - send `session.exists` with sessionId (not logged)
  - if exists -> send `session.updates` (logged)
  |
  +--> found -> return follower update payload to leader
  +--> none found -> 404 Session not found
```

### `GET /network/commands/:nodeId?limit=N`

```text
auth as nodeId
  |
  v
select recent commands where node is leader or target
  |
  v
return logs for UI/inspection
```

## 4) WebSocket Flow (`GET /ws/node`)

```text
node connects with nodeId + token
  |
  v
authenticate + accept socket
  |
  v
replace previous socket for same node (if any)
  |
  v
track in sockets map
  |
  +--> heartbeat messages update last_seen
  +--> result messages resolve/reject pending command promises
  +--> close removes socket from online map
```

Message types used:

- relay -> node: `{ type: "command", id, action, payload }`
- node -> relay: `{ type: "ack", id }`
- node -> relay: `{ type: "result", id, ok, data?, error? }`

Common command actions:

- `sessions.list`
- `session.start`
- `session.exists`
- `session.updates`

## 5) Auth Flow

```text
Authorization: Bearer <token>
or
ws query token=<token>
  |
  v
SHA-256(token) == nodes.token_hash
```

Auth is node-scoped; many endpoints additionally enforce expected node id.

## Key Files

- `apps/session-relay/src/index.ts`
- `apps/session-relay/wrangler.jsonc`
- `apps/session-relay/worker-configuration.d.ts`
