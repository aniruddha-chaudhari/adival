export { FSMemory } from "./fs/fs-memory";
export { MEMORY_TOOLS, executeMemoryTool } from "./tools";
export {
    qmdSearch,
    qmdVectorSearch,
    qmdDeepSearch,
    qmdGet,
    qmdMultiGet,
    qmdStatus,
    qmdUpdate,
    qmdEmbed,
    qmdCollectionAdd,
    qmdContextAdd,
    formatQmdResults,
} from "./qmd/qmd";
export type { QmdResult, QmdStatusResult } from "./qmd/qmd";

// Condensation pipeline
export { condenseSession, updateAgentMd, endOfSessionHook } from "./fs/condense";
export { runCondensationPipeline } from "./fs/pipeline";
export type { PipelineResult } from "./fs/pipeline";
export { runPromotion } from "./fs/promote";
export type { PromotionCandidate } from "./fs/promote";
export { compressJournalMonth, getJournalMonths } from "./fs/compress-journal";
export { rebuildAgentMd, agentMdSize } from "./fs/agent-md-writer";
export { llmSummarize } from "./fs/llm";

import { FSMemory } from "./fs/fs-memory";
import { qmdDeepSearch, formatQmdResults } from "./qmd/qmd";

/** Build system prompt context from FS memory layer.
 *  Supermemory context is handled by its MCP tools automatically. */
export function buildMemorySystemPrompt(fs: FSMemory): string {
    return fs.buildSystemPromptContext();
}

/**
 * Build full context for system prompt injection: FS memory + QMD search.
 * QMD layer covers past sessions and notes not in the active AGENT.md.
 */
export async function buildFullContext(fs: FSMemory, query: string): Promise<string> {
    const fsContext = fs.buildSystemPromptContext();

    let qmdContext = "";
    try {
        const results = qmdDeepSearch(query, { n: 5 });
        qmdContext = formatQmdResults(results);
    } catch {
        // QMD not indexed yet — skip silently
    }

    return `${fsContext}${qmdContext ? `\n\n<search_results>\n${qmdContext}\n</search_results>` : ""}`;
}
