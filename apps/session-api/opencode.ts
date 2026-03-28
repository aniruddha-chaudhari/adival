import { createOpencodeClient } from "@opencode-ai/sdk";
import { OPENCODE_BASE_URL, OPENCODE_HOST, OPENCODE_PORT, PROJECT_ROOT } from "./config.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/global/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureOpencodeServer(): Promise<void> {
  if (await isHealthy(OPENCODE_BASE_URL)) {
    console.log("[api] Connected to existing OpenCode server");
    return;
  }

  console.log("[api] Starting OpenCode server on 127.0.0.1:4096...");
  Bun.spawn(["opencode", "serve", "--hostname", OPENCODE_HOST, "--port", String(OPENCODE_PORT)], {
    cwd: PROJECT_ROOT,
    stdout: "ignore",
    stderr: "ignore",
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(100);
    if (await isHealthy(OPENCODE_BASE_URL)) {
      console.log("[api] OpenCode server is ready");
      return;
    }
  }

  throw new Error("Failed to connect to OpenCode server on 127.0.0.1:4096");
}

export function createClient() {
  return createOpencodeClient({ baseUrl: OPENCODE_BASE_URL });
}
