/**
 * eval/scripts/export-sessions.ts
 *
 * Parses recent Claude Code JSONL session files, converts them to clean
 * Markdown, and re-indexes with QMD so past sessions are searchable.
 *
 * Run manually:   bun eval/scripts/export-sessions.ts
 * Or via cron:    0 * * * *  bun /path/to/export-sessions.ts >> ~/.cache/qmd/export.log 2>&1
 *
 * Sessions are written to: memory/sessions/<session-id>.md
 */

import { resolve, basename } from "path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { homedir } from "os";
import { qmdUpdate, qmdEmbed } from "../src/memory/qmd";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const SESSIONS_DIR = resolve(homedir(), ".claude", "projects");
const EXPORT_DIR   = resolve(PROJECT_ROOT, "memory", "sessions");
const MARKER_FILE  = resolve(EXPORT_DIR, ".last-export");

// ── Ensure export directory ───────────────────────────────────────────────────
mkdirSync(EXPORT_DIR, { recursive: true });

if (!existsSync(SESSIONS_DIR)) {
    console.log(`No Claude sessions directory found at ${SESSIONS_DIR} — nothing to export.`);
    process.exit(0);
}

// ── Determine cutoff timestamp ────────────────────────────────────────────────
const cutoff = existsSync(MARKER_FILE) ? statSync(MARKER_FILE).mtimeMs : 0;
const cutoffLabel = cutoff ? new Date(cutoff).toISOString() : "all time";
console.log(`Exporting sessions modified since: ${cutoffLabel}`);

// ── Collect JSONL session files newer than cutoff ─────────────────────────────
function findSessionFiles(dir: string, since: number): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findSessionFiles(full, since));
        } else if (entry.name.endsWith(".jsonl") && statSync(full).mtimeMs > since) {
            results.push(full);
        }
    }
    return results;
}

const sessionFiles = findSessionFiles(SESSIONS_DIR, cutoff);
console.log(`Found ${sessionFiles.length} session file(s) to process.`);

// ── Parse JSONL → Markdown ────────────────────────────────────────────────────
interface JsonlEntry {
    type?: string;
    role?: string;
    content?: string | ContentBlock[];
}

interface ContentBlock {
    type?: string;
    text?: string;
}

function extractText(content: string | ContentBlock[]): string {
    if (typeof content === "string") return content;
    return content
        .filter((b): b is ContentBlock => typeof b === "object" && b.type === "text")
        .map(b => b.text ?? "")
        .join(" ");
}

function parseSession(filePath: string): string | null {
    const lines = readFileSync(filePath, "utf-8").split("\n").filter(l => l.trim());
    const messages: string[] = [];

    for (const line of lines) {
        let entry: JsonlEntry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry.type !== "message") continue;
        const role = entry.role ?? "";
        if (!["user", "assistant"].includes(role)) continue;
        const text = extractText(entry.content ?? "").trim();
        if (text) {
            messages.push(`**${role.charAt(0).toUpperCase() + role.slice(1)}**: ${text}`);
        }
    }

    if (messages.length === 0) return null;
    const sessionId = basename(filePath, ".jsonl");
    return `# Session: ${sessionId}\n\n${messages.join("\n\n")}`;
}

let exported = 0;
for (const filePath of sessionFiles) {
    const sessionId = basename(filePath, ".jsonl");
    const outPath = resolve(EXPORT_DIR, `${sessionId}.md`);
    const markdown = parseSession(filePath);
    if (markdown) {
        writeFileSync(outPath, markdown, "utf-8");
        exported++;
    }
}
console.log(`Exported ${exported} session(s) to ${EXPORT_DIR}`);

if (exported > 0) {
    // ── Re-index via QMD ──────────────────────────────────────────────────────
    console.log("Re-indexing with QMD (BM25)…");
    try {
        qmdUpdate();
        console.log("  ✓ BM25 index updated");
    } catch (e) {
        console.error("  ✗ qmd update failed:", e instanceof Error ? e.message : e);
    }

    console.log("Generating embeddings (qmd embed)…");
    try {
        qmdEmbed();
        console.log("  ✓ Embeddings updated");
    } catch (e) {
        console.warn("  ⚠ qmd embed failed (BM25 still works):", e instanceof Error ? e.message : e);
    }
}

// ── Update marker ─────────────────────────────────────────────────────────────
writeFileSync(MARKER_FILE, new Date().toISOString(), "utf-8");
console.log(`Done: ${new Date().toISOString()}`);
