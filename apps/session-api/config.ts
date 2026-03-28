import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const OPENCODE_HOST = "127.0.0.1";
export const OPENCODE_PORT = 4096;
export const OPENCODE_BASE_URL = `http://${OPENCODE_HOST}:${OPENCODE_PORT}`;

export const API_PORT = 3456;

export const STATUS_POLL_INTERVAL_MS = 2500;
export const EXPORT_POLL_INTERVAL_MS = 2000;
export const FALLBACK_FINISH_STALE_MS = 12_000;

export const SESSIONS_JSON_PATH = join(PROJECT_ROOT, "manager/sessions.json");
export const CHATS_DIR = join(PROJECT_ROOT, "manager/chats");
