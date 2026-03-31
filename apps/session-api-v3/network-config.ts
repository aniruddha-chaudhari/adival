export const RELAY_BASE_URL = process.env.RELAY_BASE_URL || "http://127.0.0.1:8787";
export const NODE_NAME = process.env.NODE_NAME || `node-${Bun.env.USER || "local"}`;
