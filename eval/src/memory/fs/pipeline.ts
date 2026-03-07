import { FSMemory } from "./fs-memory";
import { llmSummarize } from "./llm";
import { runPromotion } from "./promote";
import { compressJournalMonth, getJournalMonths } from "./compress-journal";
import { rebuildAgentMd, agentMdSize } from "./agent-md-writer";

/**
 * Progressive Memory Condensation Pipeline
 * ─────────────────────────────────────────
 * Orchestrates all compression steps in the correct order.
 *
 * Steps:
 *   1. Find yesterday's journal entries and summarize them (LLM)
 *   2. Run promotion pass — extract permanent facts → topics/promoted.md
 *   3. Age-compress all journal months (recent=paragraph, old=sentence, ancient=archive)
 *   4. Rebuild AGENT.md with a hard character cap (bounded active context)
 *   5. Re-index QMD if available
 *
 * Trigger modes:
 *   - End-of-session: call runCondensationPipeline() from session teardown
 *   - Manual: `bun run eval/src/memory/pipeline.ts` (this file is also a CLI script)
 *   - Scheduled: add to Windows Task Scheduler or cron
 */

export interface PipelineResult {
    journalMonthsProcessed: string[];
    entriesCompressed: number;
    entriesArchived: number;
    promotedFacts: number;
    agentMdChars: number;
    durationMs: number;
    errors: string[];
}

/** LLM summarizer for yesterday's journal */
async function summarizeYesterdayEntries(fs: FSMemory): Promise<{ summary: string; dateStr: string } | null> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD
    const month = dateStr.slice(0, 7); // YYYY-MM

    const journalContent = fs.readFile(`journals/${month}.journal.md`);
    if (journalContent.startsWith("[File not found")) return null;

    // Extract yesterday's entries only
    const chunks = journalContent.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(c => c.trim());
    const yesterdayChunks = chunks.filter(c => c.startsWith(`## ${dateStr}`));

    if (yesterdayChunks.length === 0) return null;

    const raw = yesterdayChunks.join("\n\n");

    const prompt = `Summarize these journal entries from ${dateStr} for an AI coding assistant's memory system.

Produce a bullet list (6-10 bullets) covering:
- What projects/files were worked on
- Key decisions made
- Problems encountered and how resolved
- Anything the agent should remember for next time

Be specific and factual. Include project names, file names, technologies.

Raw journal entries:
${raw}`;

    try {
        const summary = await llmSummarize(prompt);
        return { summary, dateStr };
    } catch (e) {
        return { summary: raw.slice(0, 500), dateStr };
    }
}

/**
 * Re-index QMD after compression if qmd is available.
 * Silently skips if qmd is not installed.
 */
async function reindexQmd(fs: FSMemory): Promise<void> {
    try {
        const { qmdUpdate } = await import("../qmd/qmd");
        qmdUpdate();
    } catch {
        // QMD not available — skip silently
    }
}

/**
 * Main condensation pipeline. Safe to run multiple times (idempotent for compression).
 */
export async function runCondensationPipeline(
    fs: FSMemory,
    options: { verbose?: boolean; skipQmd?: boolean } = {}
): Promise<PipelineResult> {
    const start = Date.now();
    const errors: string[] = [];
    let promotedFacts = 0;
    let entriesCompressed = 0;
    let entriesArchived = 0;
    const journalMonthsProcessed: string[] = [];

    const log = (msg: string) => {
        if (options.verbose) console.log(`[memory/pipeline] ${msg}`);
    };

    // ── Step 1: Summarize yesterday's journal ─────────────────────────────────
    log("Step 1: Summarizing yesterday's journal entries…");
    try {
        const result = await summarizeYesterdayEntries(fs);
        if (result) {
            // Store the summary back as a condensed version
            const month = result.dateStr.slice(0, 7);
            const condensedPath = `journals/${month}.condensed.md`;
            const existing = fs.readFile(condensedPath);
            const separator = existing.startsWith("[File not found") ? "" : "\n\n";
            fs.writeFile(
                condensedPath,
                `${existing.startsWith("[File not found") ? "" : existing}${separator}## ${result.dateStr} (condensed)\n${result.summary}\n`,
                "write"
            );
            log(`Condensed entries for ${result.dateStr}`);

            // ── Step 2: Run promotion pass ──────────────────────────────────
            log("Step 2: Running promotion algorithm…");
            const promoted = await runPromotion(fs, result.summary, condensedPath, result.dateStr);
            promotedFacts = promoted.length;
            log(`Promoted ${promotedFacts} facts to topics/promoted.md`);
        } else {
            log("No yesterday entries found — skipping summarization");
        }
    } catch (e) {
        const msg = `Step 1-2 error: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(msg);
        log(msg);
    }

    // ── Step 3: Age-compress all journal months ───────────────────────────────
    log("Step 3: Running age-based compression on all journal months…");
    try {
        const months = getJournalMonths(fs);
        for (const month of months) {
            const stats = await compressJournalMonth(fs, month);
            if (stats.compressed > 0 || stats.archived > 0) {
                journalMonthsProcessed.push(month);
                entriesCompressed += stats.compressed;
                entriesArchived += stats.archived;
                log(`  ${month}: ${stats.compressed} compressed, ${stats.archived} archived, ${stats.unchanged} unchanged`);
            }
        }
    } catch (e) {
        const msg = `Step 3 error: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(msg);
        log(msg);
    }

    // ── Step 4: Rebuild bounded AGENT.md ─────────────────────────────────────
    log("Step 4: Rebuilding AGENT.md…");
    let agentMdChars = 0;
    try {
        await rebuildAgentMd(fs);
        agentMdChars = agentMdSize(fs);
        log(`AGENT.md rebuilt (${agentMdChars} chars)`);
    } catch (e) {
        const msg = `Step 4 error: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(msg);
        log(msg);
    }

    // ── Step 5: Re-index QMD ──────────────────────────────────────────────────
    if (!options.skipQmd) {
        log("Step 5: Re-indexing QMD…");
        try {
            await reindexQmd(fs);
            log("QMD re-indexed");
        } catch (e) {
            log("QMD re-index skipped (not available)");
        }
    }

    const result: PipelineResult = {
        journalMonthsProcessed,
        entriesCompressed,
        entriesArchived,
        promotedFacts,
        agentMdChars,
        durationMs: Date.now() - start,
        errors,
    };

    log(`\nPipeline complete in ${result.durationMs}ms`);
    if (errors.length > 0) log(`Errors: ${errors.join("; ")}`);

    return result;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────
// Run with: bun run eval/src/memory/pipeline.ts [--verbose] [--dry-run] [--skip-qmd]
// or:       bun eval/src/memory/pipeline.ts
if (import.meta.main) {
    const args = process.argv.slice(2);
    const verbose = args.includes("--verbose") || args.includes("-v");
    const skipQmd = args.includes("--skip-qmd");

    console.log("🧠 Memory Condensation Pipeline");
    console.log("================================");

    const fs = new FSMemory();
    runCondensationPipeline(fs, { verbose: true, skipQmd })
        .then(result => {
            console.log("\n✅ Pipeline complete");
            console.log(`   Duration:       ${result.durationMs}ms`);
            console.log(`   Months touched: ${result.journalMonthsProcessed.join(", ") || "none"}`);
            console.log(`   Compressed:     ${result.entriesCompressed} entries`);
            console.log(`   Archived:       ${result.entriesArchived} entries`);
            console.log(`   Promoted facts: ${result.promotedFacts}`);
            console.log(`   AGENT.md size:  ${result.agentMdChars} chars`);
            if (result.errors.length > 0) {
                console.log(`\n⚠️  Errors (${result.errors.length}):`);
                result.errors.forEach(e => console.log(`   - ${e}`));
            }
        })
        .catch(e => {
            console.error("❌ Pipeline failed:", e);
            process.exit(1);
        });
}
