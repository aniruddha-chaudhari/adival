import { FSMemory } from "./fs-memory";
import { llmSummarize } from "./llm";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Age-based journal compression.
 *
 * Strategy:
 *   - Yesterday's journal entry  → stays as full paragraph (~50-200 words)
 *   - 7–29 days old entries      → compressed to ~2-3 sentences per day
 *   - 30–89 days old entries     → compressed to 1 sentence per entry
 *   - 90+ days old entries       → archived to memory/archive/ and removed from active journal
 *
 * We work on monthly journal files (YYYY-MM.journal.md).
 */

const ENTRY_HEADER_RE = /^## (\d{4}-\d{2}-\d{2}) \d{2}:\d{2}/m;

interface JournalEntry {
    date: string;       // YYYY-MM-DD
    rawHeader: string;  // full ## line
    body: string;       // everything after the header until next ##
    agedays: number;
}

function parseDayAge(dateStr: string): number {
    const then = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

/** Parse a monthly journal file into its entries */
function parseJournalEntries(content: string): JournalEntry[] {
    const chunks = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(c => c.trim());
    const entries: JournalEntry[] = [];

    for (const chunk of chunks) {
        const headerMatch = chunk.match(/^## (\d{4}-\d{2}-\d{2}) .+/m);
        if (!headerMatch) continue;
        const date = headerMatch[1];
        entries.push({
            date,
            rawHeader: headerMatch[0],
            body: chunk.slice(headerMatch[0].length).replace(/^\n/, ""),
            agedays: parseDayAge(date),
        });
    }

    return entries;
}

/** Compress a single entry body using the LLM */
async function compressEntry(entry: JournalEntry, targetLength: "paragraph" | "sentences" | "sentence"): Promise<string> {
    const instructions: Record<typeof targetLength, string> = {
        paragraph: `Summarize this journal entry in 2-4 concise sentences. Keep all technical decisions, project names, and key outcomes. Be factual.`,
        sentences: `Compress this journal entry to 1-2 sentences. Keep only the most important outcome or decision.`,
        sentence: `Compress this journal entry to a single short sentence (max 20 words). Keep only the single most important fact.`,
    };

    const prompt = `${instructions[targetLength]}

Journal entry (${entry.date}):
${entry.body}

Compressed version:`;

    try {
        const result = await llmSummarize(prompt);
        return result.trim();
    } catch {
        // Fallback: truncate to first N chars
        const limits = { paragraph: 400, sentences: 200, sentence: 100 };
        return entry.body.slice(0, limits[targetLength]).replace(/\n/g, " ").trim() + "…";
    }
}

/** Archive old entries to memory/archive/YYYY-MM.journal.md */
function archiveEntry(fs: FSMemory, entry: JournalEntry, month: string): void {
    const archivePath = `archive/${month}.journal.md`;
    const existing = fs.readFile(archivePath);
    const isNew = existing.startsWith("[File not found");

    const content = `${entry.rawHeader}\n${entry.body}\n`;
    fs.writeFile(archivePath, content, isNew ? "write" : "append");
}

/**
 * Run age-based compression on a single monthly journal file.
 * Returns the number of entries compressed.
 * @param fs FSMemory instance
 * @param month YYYY-MM string
 * @param dryRun If true, only returns stats without writing
 */
export async function compressJournalMonth(
    fs: FSMemory,
    month: string,
    dryRun = false
): Promise<{ compressed: number; archived: number; unchanged: number }> {
    const journalPath = `journals/${month}.journal.md`;
    const content = fs.readFile(journalPath);

    if (content.startsWith("[File not found")) {
        return { compressed: 0, archived: 0, unchanged: 0 };
    }

    const entries = parseJournalEntries(content);
    const stats = { compressed: 0, archived: 0, unchanged: 0 };

    const rebuiltEntries: string[] = [];

    for (const entry of entries) {
        if (entry.agedays >= 90) {
            // Archive and remove from active journal
            if (!dryRun) archiveEntry(fs, entry, month);
            stats.archived++;
        } else if (entry.agedays >= 30) {
            // Compress to single sentence
            const compressed = await compressEntry(entry, "sentence");
            rebuiltEntries.push(`${entry.rawHeader}\n${compressed}\n`);
            stats.compressed++;
        } else if (entry.agedays >= 7) {
            // Compress to 1-2 sentences
            const compressed = await compressEntry(entry, "sentences");
            rebuiltEntries.push(`${entry.rawHeader}\n${compressed}\n`);
            stats.compressed++;
        } else {
            // Recent entries (0-6 days): keep as-is
            rebuiltEntries.push(`${entry.rawHeader}\n${entry.body}`);
            stats.unchanged++;
        }
    }

    if (!dryRun) {
        if (rebuiltEntries.length === 0) {
            // All entries archived — remove the file
            fs.writeFile(journalPath, `# ${month} — all entries archived\n`, "write");
        } else {
            fs.writeFile(journalPath, rebuiltEntries.join("\n") + "\n", "write");
        }
    }

    return stats;
}

/**
 * Get list of all journal months present in the journals directory.
 */
export function getJournalMonths(fs: FSMemory): string[] {
    const files = fs.listFiles("journals");
    return files
        .filter(f => /^\d{4}-\d{2}\.journal\.md$/.test(f))
        .map(f => f.replace(".journal.md", ""))
        .sort();
}
