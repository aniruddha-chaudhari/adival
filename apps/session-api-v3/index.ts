import { API_PORT, CHATS_DIR, NODE_IDENTITY_PATH, PROJECT_ROOT } from "./config.ts";
import { SessionExporter } from "./exporter.ts";
import { loadIdentity, saveIdentity } from "./identity.ts";
import { NODE_NAME, RELAY_BASE_URL } from "./network-config.ts";
import { ensureOpencodeServer, createClient } from "./opencode.ts";
import { RelayClient, registerNode } from "./relay-client.ts";
import { buildApp, buildCommandExecutor } from "./routes.ts";
import { SessionService } from "./session-service.ts";
import { startRelaySocket } from "./ws-client.ts";

export async function main(): Promise<void> {
  await ensureOpencodeServer();

  const existingIdentity = await loadIdentity(NODE_IDENTITY_PATH);
  const registeredIdentity = await registerNode({
    relayBaseUrl: RELAY_BASE_URL,
    name: NODE_NAME,
    existingCode: existingIdentity?.code,
  });
  await saveIdentity(NODE_IDENTITY_PATH, registeredIdentity);

  const relayClient = new RelayClient(RELAY_BASE_URL, registeredIdentity);
  const client = createClient();
  const exporter = new SessionExporter(PROJECT_ROOT, CHATS_DIR);
  const service = new SessionService(client, exporter);
  const executeCommand = buildCommandExecutor(service);

  startRelaySocket({
    wsUrl: relayClient.wsUrl,
    nodeId: relayClient.nodeId,
    execute: executeCommand,
  });

  const app = buildApp({
    service,
    relayClient,
    nodeId: relayClient.nodeId,
  });

  console.log(`[api-v3] Session API v3 running on http://localhost:${API_PORT}`);
  console.log(`[api-v3] Relay: ${RELAY_BASE_URL}`);
  console.log(`[api-v3] Node ID: ${registeredIdentity.nodeId}`);
  console.log(`[api-v3] Node Code: ${registeredIdentity.code}`);
  console.log("[api-v3] Endpoints:");
  console.log("[api-v3]   GET  /network/list");
  console.log("[api-v3]   POST /network/elect");
  console.log("[api-v3]   GET  /network/logs");
  console.log("[api-v3]   POST /session/start");
  console.log("[api-v3]   GET  /sessions");
  console.log("[api-v3]   GET  /session/:id/updates");

  Bun.serve({
    port: API_PORT,
    fetch: app.fetch,
  });
}
