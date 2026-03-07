import { FSMemory } from "./fs-memory";
import { llmSummarize } from "./llm";

/**
 * AGENT.md writer — rebuilds the active context file from scratch.
 *
 * Design principles:
 *   1. BOUNDED — hard cap of ~2000 chars (enforced by LLM truncation prompt)
 *   2. PRIORITIZED — recent items win over old ones
 *   3. STRUCTURED — fixed sections so the agent always knows where to look
 *
 * Section layout (in order of priority):
 *   # Active Memory
 *   ## Identity & Prefs        (from profile.md)
 *   ## Current Projects        (from topics/promoted.md, recency filtered)
 *   ## Recent Context          (last 3 journal entries, compressed)
 *   ## Pinned Facts            (explicitly PERMANENT flagged items)
 */

const MAX_AGENT_MD_CHARS = 2000;

interface AgentMdSections {
    profile: string;
    recentJournal: string;
    promotedFacts: string;
}

/**
 * Gather input sections from FSMemory. Each is raw/uncompressed;
 * the LLM shrinks them.
 */
function gatherSections(fs: FSMemory): AgentMdSections {
    const profile = fs.readFile("profile.md").startsWith("[File not found")
        ? ""
        : fs.readFile("profile.md");

    // Get last 3 journal entries from the current month
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const journalRaw = fs.readFile(`journals/${month}.journal.md`);
    const recentJournal = extractRecentEntries(journalRaw, 3);

    const promotedRaw = fs.readFile("topics/promoted.md");
    const promotedFacts = promotedRaw.startsWith("[File not found") ? "" : promotedRaw;

    return { profile, recentJournal, promotedFacts };
}

/** Extract the N most recent entries from a journal file */
function extractRecentEntries(journalContent: string, n: number): string {
    if (!journalContent || journalContent.startsWith("[File not found")) return "";
    const chunks = journalContent.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(c => c.trim());
    return chunks.slice(-n).join("\n");
}

/**
 * Use the LLM to build a bounded AGENT.md from the gathered sections.
 * The prompt enforces the 2000-char output limit.
 */
async function buildBoundedAgentMd(sections: AgentMdSections): Promise<string> {
    const hasContent = sections.profile || sections.recentJournal || sections.promotedFacts;

    if (!hasContent) {
        return "# Active Memory\n\n_No memory recorded yet. Start working and I'll learn from you._\n";
    }

    const prompt = `You are rebuilding the AGENT.md active memory file for an AI coding assistant.
This file is injected into every session's system prompt, so it MUST be concise.

HARD LIMIT: Output must be under ${MAX_AGENT_MD_CHARS} characters total. Ruthlessly cut redundant or ephemeral info.

Input sections (use ALL of these as source material):

--- PROFILE (persistent identity/preferences) ---
${sections.profile || "(empty)"}

--- RECENT JOURNAL (last few sessions) ---
${sections.recentJournal || "(empty)"}

--- PROMOTED FACTS (long-term important facts) ---
${sections.promotedFacts || "(empty)"}

Output format (strict markdown, no deviations):

# Active Memory

## Identity & Preferences
[2-5 bullet points: who the user is, tech preferences, persistent constraints]

## Active Projects
[3-6 bullet points: current project state, what's in-flight]

## Key Decisions
[2-4 bullet points: architecture/tech decisions that affect future work]

## Recent Context
[3-5 bullet points: what happened in the last 1-3 sessions]

Rules:
- Be extremely concise. Every word must earn its place.
- Use bullet points, not prose paragraphs.
- If a section has nothing relevant, omit it entirely.
- Output must fit in ${MAX_AGENT_MD_CHARS} characters.`;

    try {
        const result = await llmSummarize(prompt);
        // Safety: enforce char limit even if LLM overshoots
        if (result.length > MAX_AGENT_MD_CHARS * 1.2) {
            return result.slice(0, MAX_AGENT_MD_CHARS) + "\n\n_[truncated]_\n";
        }
        return result;
    } catch (e) {
        // Fallback: manual construction under the limit
        return buildFallbackAgentMd(sections);
    }
}

/** Minimal fallback AGENT.md if Gemini is unavailable */
function buildFallbackAgentMd(sections: AgentMdSections): string {
    const lines: string[] = ["# Active Memory\n"];

    if (sections.profile) {
        lines.push("## Profile\n");
        lines.push(sections.profile.slice(0, 500));
    }
    if (sections.recentJournal) {
        lines.push("\n## Recent Context\n");
        lines.push(sections.recentJournal.slice(0, 600));
    }
    if (sections.promotedFacts) {
        lines.push("\n## Key Facts\n");
        lines.push(sections.promotedFacts.slice(0, 500));
    }

    const content = lines.join("\n");
    return content.slice(0, MAX_AGENT_MD_CHARS);
}

/**
 * Main entry point: rebuild AGENT.md from current memory state.
 * Returns the new AGENT.md content (also writes it to disk).
 */
export async function rebuildAgentMd(fs: FSMemory): Promise<string> {
    const sections = gatherSections(fs);
    const content = await buildBoundedAgentMd(sections);
    fs.writeFile("AGENT.md", content, "write");
    return content;
}

/** Return the current size of AGENT.md in characters */
export function agentMdSize(fs: FSMemory): number {
    const content = fs.readFile("AGENT.md");
    return content.startsWith("[File not found") ? 0 : content.length;
}
