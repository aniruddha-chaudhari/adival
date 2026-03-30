import { API_PORT, CHATS_DIR, PROJECT_ROOT } from "./config.ts";
import { ensureOpencodeServer, createClient } from "./opencode.ts";
import { SessionExporter } from "./exporter.ts";
import { buildApp } from "./routes.ts";

export async function main(): Promise<void> {
  await ensureOpencodeServer();

  const client = createClient();
  const exporter = new SessionExporter(PROJECT_ROOT, CHATS_DIR);
  const app = buildApp(client, exporter);

  console.log(`[api-v2] Session API v2 running on http://localhost:${API_PORT}`);
  console.log("[api-v2] Endpoints:");
  console.log("[api-v2]   POST /session/start");
  console.log("[api-v2]   GET  /sessions");
  console.log("[api-v2]   GET  /session/:id/updates");

  Bun.serve({
    port: API_PORT,
    fetch: app.fetch,
  });
}
