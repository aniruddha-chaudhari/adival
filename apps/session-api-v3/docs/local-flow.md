# Session API v3 Local Flow

This document describes how a local `session-api-v3` node boots, joins the relay network, and serves session endpoints.

## 1) Startup Flow (`main.ts`)

```text
main()
  |
  v
ensureOpencodeServer()
  |
  v
loadIdentity(manager/*.identity.json)
  |
  v
registerNode(relay, existingCode?)
  |
  +--> existing code found at relay -> resume same node
  |
  +--> no code found -> create new node + new code
  |
  v
saveIdentity(...)
  |
  v
create RelayClient + SessionService
  |
  v
startRelaySocket(ws://.../ws/node?nodeId=...&token=...)
  |
  v
start HTTP server (Bun.serve)
```

Identity is persisted locally so fresh process restarts do not create duplicate nodes.

## 2) Node-to-Relay Connection Flow

`startRelaySocket(...)` keeps a persistent outbound WebSocket to relay.

```text
connect ws
  |
  +--> on open: mark connected
  |
  +--> every 20s: send heartbeat
  |
  +--> on relay command: execute local action -> send result
  |
  +--> on close/error: retry after delay
```

Supported command actions from relay:

- `sessions.list`
- `session.start`
- `session.exists`
- `session.updates`

## 3) HTTP Route Flow

### `GET /network/list`

```text
local route -> relayClient.listCandidates() -> relay /network/list/:nodeId
```

Returns leader candidates excluding self and nodes already led by self.

### `POST /network/elect`

```text
local route (leaderCode) -> relayClient.electLeader(...) -> relay /network/elect
```

Sets one leader for this node.

### `POST /network/reregister-name`

```text
local route (name)
  |
  v
relay register with same code + new name
  |
  v
local identity file updated with refreshed token and name
```

No new relay endpoint is used for rename; this reuses `POST /network/register`.

### `GET /network/logs`

```text
local route -> relayClient.listCommandLogs(limit) -> relay /network/commands/:nodeId
```

Returns recent relay command logs involving this node.

### `POST /session/start`

```text
request body: { prompt, model?, sessionId?, clientId? }
  |
  +--> no clientId OR clientId == self
  |      -> SessionService.startLocalSession(...)
  |
  +--> clientId is follower
         -> relayClient.sendCommand(clientId, "session.start", payload)
```

### `GET /sessions`

```text
list local sessions (today-only)
  |
  v
fetch online followers from relay
  |
  v
for each online follower: relay command "sessions.list"
  |
  v
merge result map as:
{ your: Session[], <followerName>: Session[] }
```

Only online followers are included. Offline followers are omitted.
If two followers have the same name, keys are auto-suffixed (`name`, `name-2`, `name-3`).

### `GET /session/:id/updates`

```text
try local session lookup
  |
  +--> found locally -> export latest markdown -> return tail content
  |
  +--> not found locally
         -> relayClient.requestSessionUpdates(sessionId)
         -> relay resolves follower owner
         -> follower returns updates
         -> leader returns same payload
```

This endpoint now supports remote follower sessions through relay fallback.

## 4) Session Filtering Rule

`SessionService.listLocalSessions()` returns sessions created on the current local day.

- local timezone boundary is used
- same logic applies to follower sessions because follower handles `sessions.list`

## Key Files

- `apps/session-api-v3/main.ts`
- `apps/session-api-v3/index.ts`
- `apps/session-api-v3/routes.ts`
- `apps/session-api-v3/session-service.ts`
- `apps/session-api-v3/relay-client.ts`
- `apps/session-api-v3/ws-client.ts`
- `apps/session-api-v3/identity.ts`
