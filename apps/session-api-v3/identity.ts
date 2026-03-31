import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NodeIdentity } from "./types.ts";

export async function loadIdentity(filePath: string): Promise<NodeIdentity | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as NodeIdentity;
    if (!parsed.nodeId || !parsed.code || !parsed.relayToken || !parsed.name) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveIdentity(filePath: string, identity: NodeIdentity): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(identity, null, 2), "utf8");
}
