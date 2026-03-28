import {
  API_PORT,
  CHATS_DIR,
  PROJECT_ROOT,
  SESSIONS_JSON_PATH,
  STATUS_POLL_INTERVAL_MS,
  EXPORT_POLL_INTERVAL_MS,
} from "./config.ts";
import { ensureOpencodeServer, createClient } from "./opencode.ts";
import { SessionStore } from "./store.ts";
import { SessionExporter } from "./exporter.ts";
import { SessionSupervisor } from "./supervisor.ts";
import { buildApp } from "./routes.ts";

export async function main(): Promise<void> {
  await ensureOpencodeServer();

  const client = createClient();
  const store = new SessionStore(SESSIONS_JSON_PATH);
  const exporter = new SessionExporter(PROJECT_ROOT, CHATS_DIR);
  const supervisor = new SessionSupervisor(
    client,
    store,
    exporter,
    PROJECT_ROOT,
    STATUS_POLL_INTERVAL_MS,
    EXPORT_POLL_INTERVAL_MS
  );

  await supervisor.start();

  const app = buildApp(client, store, exporter, supervisor);

  console.log(`[api] Session API running on http://localhost:${API_PORT}`);
  console.log("[api] Endpoints:");
  console.log("[api]   POST /session/start");
  console.log("[api]   GET  /sessions");
  console.log("[api]   GET  /session/:id/updates");

  Bun.serve({
    port: API_PORT,
    fetch: app.fetch,
  });

  const shutdown = () => {
    supervisor.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
