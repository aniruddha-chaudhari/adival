import { FSMemory } from "./fs-memory";
import { llmSummarize } from "./llm";

/**
 * Session condensation — called at end of each session.
 * Replaces the stub that only extracted headers.
 *
 * This module is now a thin wrapper that:
 *  1. Reads the current month's journal
 *  2. Calls the LLM to summarize recent entries (today's)
 *  3. Delegates to the full pipeline for age-compression and AGENT.md rebuild
 *
 * For full pipeline execution (scheduled/manual), use pipeline.ts instead.
 */

/** Extract key information from a daily/monthly journal using the LLM */
export async function condenseSession(fs: FSMemory, dateStr: string): Promise<string> {
    const month = dateStr.slice(0, 7);
    const journalPath = `journals/${month}.journal.md`;
    const content = fs.readFile(journalPath);

    if (content.startsWith("[File not found")) return "";

    // Extract only entries from the specified date
    const chunks = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(c => c.trim());
    const dayChunks = chunks.filter(c => c.startsWith(`## ${dateStr}`));

    if (dayChunks.length === 0) return "";

    const raw = dayChunks.join("\n\n");

    const prompt = `Summarize these journal entries from ${dateStr}. 
Produce a concise bullet list (4-8 bullets) of what was done, decisions made, and what to remember next session.
Be specific — include project names, file names, key technical choices.

Journal entries:
${raw}

Bullets:`;

    try {
        return await llmSummarize(prompt);
    } catch {
        // Fallback: return cleaned text if LLM fails
        return raw
            .split("\n")
            .filter(l => l.trim().length > 0)
            .join("\n");
    }
}

/**
 * Called at end of session to update AGENT.md with latest profile + recent context.
 * This is the lightweight version — for full compression run pipeline.ts.
 */
export async function updateAgentMd(fs: FSMemory): Promise<void> {
    const { rebuildAgentMd } = await import("./agent-md-writer");
    await rebuildAgentMd(fs);
}

/**
 * End-of-session hook: condense today's entries and update AGENT.md.
 * Designed to be called quickly at session end without the full pipeline cost.
 */
export async function endOfSessionHook(fs: FSMemory): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await condenseSession(fs, today);
    await updateAgentMd(fs);
}
