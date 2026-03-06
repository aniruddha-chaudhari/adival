export { FSMemory } from "./fs-memory";
export { MEMORY_TOOLS, executeMemoryTool } from "./tools";

import { FSMemory } from "./fs-memory";

/** Build system prompt context from FS memory layer.
 *  Supermemory context is handled by its MCP tools automatically. */
export function buildMemorySystemPrompt(fs: FSMemory): string {
    return fs.buildSystemPromptContext();
}
