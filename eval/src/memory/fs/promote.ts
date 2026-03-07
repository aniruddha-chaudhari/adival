import { FSMemory } from "./fs-memory";
import { llmSummarize } from "./llm";

/**
 * Promotion system: decides what crosses the threshold from "session note"
 * to a permanent fact/topic entry.
 *
 * Promotion criteria (any one sufficient):
 *   - Explicitly flagged with "IMPORTANT:", "DECIDED:", "PERMANENT:", "KEY FACT:"
 *   - Mentioned in 2+ different journal entries (recurrence signal)
 *   - LLM judge returns confidence >= 0.7
 */

export interface PromotionCandidate {
    text: string;
    source: string; // journal file it came from
    score: number;  // 0.0 – 1.0
    reason: string;
}

const EXPLICIT_FLAGS = /\b(IMPORTANT|DECIDED|PERMANENT|KEY FACT|ALWAYS|NEVER):/i;

/**
 * Extract candidate facts from a condensed journal entry string.
 * Returns sentences/bullets that might be worth promoting.
 */
function extractCandidates(condensed: string, source: string): PromotionCandidate[] {
    const lines = condensed.split("\n").map(l => l.trim()).filter(l => l.length > 20);
    const candidates: PromotionCandidate[] = [];

    for (const line of lines) {
        if (EXPLICIT_FLAGS.test(line)) {
            candidates.push({ text: line, source, score: 0.9, reason: "explicit flag" });
        } else if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\./.test(line)) {
            // Bullet points are more likely to be factual
            candidates.push({ text: line, source, score: 0.4, reason: "structured bullet" });
        }
    }

    return candidates;
}

/**
 * Boost score for facts that appear in multiple journal months.
 * Simple recurrence check: scan the profile and topics for existing mentions.
 */
function boostRecurrence(candidate: PromotionCandidate, existingMemory: string): PromotionCandidate {
    // Tokenize the candidate into meaningful words (3+ chars)
    const words = candidate.text
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length >= 3);

    const matchCount = words.filter(w => existingMemory.toLowerCase().includes(w)).length;
    const recurrenceRatio = matchCount / Math.max(words.length, 1);

    if (recurrenceRatio >= 0.5) {
        return { ...candidate, score: Math.min(1.0, candidate.score + 0.3), reason: candidate.reason + " + recurrence" };
    }
    return candidate;
}

/**
 * Use the LLM to judge whether a batch of candidates should be promoted.
 * Returns a filtered list where the model says "yes, permanent fact".
 */
async function llmJudgePromotion(candidates: PromotionCandidate[]): Promise<PromotionCandidate[]> {
    if (candidates.length === 0) return [];

    const listed = candidates
        .map((c, i) => `[${i + 1}] ${c.text}`)
        .join("\n");

    const prompt = `You are a memory curator for an AI coding assistant. Below are facts extracted from recent session journals.

Your job: decide which facts are PERMANENT (worth storing long-term in a profile) vs EPHEMERAL (only relevant to that session).

A fact is PERMANENT if:
- It's a project decision or architecture choice
- It's a user preference or recurring pattern
- It's a constraint that will affect future work ("we always use bun", "auth uses JWT with RS256")
- It's a key insight that would save future agents from repeating work

A fact is EPHEMERAL if:
- It's a todo specific to one session
- It's a debugging step that was tried and discarded
- It references a specific error message or transient state

Facts to evaluate:
${listed}

Respond with ONLY a JSON array of indices (1-based) of facts to PROMOTE, e.g. [1, 3, 5] or [].
No explanation needed.`;

    try {
        const raw = await llmSummarize(prompt);
        const match = raw.match(/\[[\d,\s]*\]/);
        if (!match) return [];
        const indices: number[] = JSON.parse(match[0]);
        return indices
            .filter(i => i >= 1 && i <= candidates.length)
            .map(i => ({ ...candidates[i - 1], score: 0.85, reason: candidates[i - 1].reason + " + llm-judge" }));
    } catch {
        // Fallback: only return explicitly flagged ones
        return candidates.filter(c => c.score >= 0.9);
    }
}

/**
 * Append promoted facts to topics/<topic>.md files.
 * Groups them loosely — all go to topics/promoted.md with a timestamp.
 */
function writePromotedFacts(fs: FSMemory, facts: PromotionCandidate[], dateStr: string): void {
    if (facts.length === 0) return;

    const existing = fs.readFile("topics/promoted.md");
    const isNew = existing.startsWith("[File not found");

    const header = isNew ? "# Promoted Facts\n\nAuto-promoted from session journals by the condensation pipeline.\n\n" : "";
    const block = [
        `## ${dateStr}`,
        ...facts.map(f => `- ${f.text.replace(/^[-*]\s*/, "")}  _(${f.reason})_`),
        "",
    ].join("\n");

    fs.writeFile("topics/promoted.md", header + block + "\n", isNew ? "write" : "append");
}

/**
 * Main entry point: run the full promotion pass on a condensed journal string.
 * Returns the list of promoted facts.
 */
export async function runPromotion(
    fs: FSMemory,
    condensedJournal: string,
    sourceFile: string,
    dateStr: string
): Promise<PromotionCandidate[]> {
    const existingMemory = fs.readFile("profile.md") + "\n" + fs.readFile("topics/promoted.md");

    // Step 1: extract candidates
    let candidates = extractCandidates(condensedJournal, sourceFile);

    // Step 2: boost by recurrence
    candidates = candidates.map(c => boostRecurrence(c, existingMemory));

    // Step 3: pre-filter obvious ones (score >= 0.9) and LLM-judge the rest
    const obvious = candidates.filter(c => c.score >= 0.9);
    const borderline = candidates.filter(c => c.score >= 0.4 && c.score < 0.9);
    const llmPromoted = await llmJudgePromotion(borderline);

    const allPromoted = [...obvious, ...llmPromoted];

    // Step 4: write to topics/promoted.md
    writePromotedFacts(fs, allPromoted, dateStr);

    return allPromoted;
}
