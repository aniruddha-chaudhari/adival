import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const OPENCODE_HOST = "127.0.0.1";
export const OPENCODE_PORT = 4096;
export const OPENCODE_BASE_URL = `http://${OPENCODE_HOST}:${OPENCODE_PORT}`;

export const API_PORT = 3457;

export const CHATS_DIR = join(PROJECT_ROOT, "manager/chats");
