/**
 * eval/scripts/qmd-setup.ts
 *
 * One-time setup: registers QMD collections for the eval project and kicks off
 * the initial BM25 index + vector embedding pass.
 *
 * Run with:  bun eval/scripts/qmd-setup.ts
 */

import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import {
    qmdCollectionAdd,
    qmdContextAdd,
    qmdUpdate,
    qmdEmbed,
    qmdStatus,
} from "../src/memory/qmd/qmd";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const MEMORY_DIR = resolve(PROJECT_ROOT, "memory");
const EVAL_DIR = resolve(PROJECT_ROOT, "eval");
const SESSIONS_EXPORT_DIR = resolve(MEMORY_DIR, "sessions");

// ── Ensure required directories exist ────────────────────────────────────────
for (const dir of [MEMORY_DIR, SESSIONS_EXPORT_DIR]) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`Created: ${dir}`);
    }
}

// ── Register collections ──────────────────────────────────────────────────────
type Collection = { dir: string; name: string; context: string };

const COLLECTIONS: Collection[] = [
    {
        dir: MEMORY_DIR,
        name: "memory",
        context: "Agent memory: user profile, decisions, session summaries, project state",
    },
    {
        dir: SESSIONS_EXPORT_DIR,
        name: "sessions",
        context: "Parsed Claude Code / agent session transcripts and conversation history",
    },
    {
        dir: EVAL_DIR,
        name: "eval",
        context: "Evaluation framework code, task definitions, eval results and summaries",
    },
];

// Optionally add the user's Claude projects directory if it exists
const claudeProjects = resolve(homedir(), ".claude", "projects");
if (existsSync(claudeProjects)) {
    COLLECTIONS.push({
        dir: claudeProjects,
        name: "claude-sessions",
        context: "Raw Claude Code session JSONL files",
    });
}

console.log("── Registering collections ──────────────────────────────────────");
for (const col of COLLECTIONS) {
    try {
        qmdCollectionAdd(col.dir, col.name);
        console.log(`  ✓ collection: ${col.name}  →  ${col.dir}`);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // "already exists" is fine — skip silently
        if (!msg.toLowerCase().includes("already")) {
            console.warn(`  ⚠ ${col.name}: ${msg}`);
        } else {
            console.log(`  ~ ${col.name}: already registered`);
        }
    }
}

console.log("\n── Adding collection context ─────────────────────────────────────");
for (const col of COLLECTIONS) {
    try {
        qmdContextAdd(`qmd://${col.name}`, col.context);
        console.log(`  ✓ context: ${col.name}`);
    } catch (e: unknown) {
        console.warn(`  ⚠ context ${col.name}: ${e instanceof Error ? e.message : e}`);
    }
}

// ── Build BM25 index ──────────────────────────────────────────────────────────
console.log("\n── Building BM25 index (qmd update) ─────────────────────────────");
try {
    qmdUpdate();
    console.log("  ✓ BM25 index built");
} catch (e: unknown) {
    console.error("  ✗ index failed:", e instanceof Error ? e.message : e);
    process.exit(1);
}

// ── Generate vector embeddings ────────────────────────────────────────────────
console.log("\n── Generating embeddings (qmd embed) ────────────────────────────");
console.log("  First run downloads ~2 GB of models — this may take several minutes.");
try {
    qmdEmbed();
    console.log("  ✓ Embeddings generated");
} catch (e: unknown) {
    console.error("  ✗ embed failed:", e instanceof Error ? e.message : e);
    // Non-fatal — BM25 search still works
}

// ── Final status ──────────────────────────────────────────────────────────────
console.log("\n── QMD Status ───────────────────────────────────────────────────");
const status = qmdStatus();
if (status) {
    console.log(`  Collections: ${status.collections}`);
    console.log(`  Documents:   ${status.documents}`);
    console.log(`  Vectors:     ${status.vectors}`);
    console.log(`  MCP:         ${status.mcp}`);
} else {
    console.warn("  (status unavailable)");
}

console.log("\nSetup complete. Add QMD as an MCP server in your editor settings:");
console.log('  { "mcpServers": { "qmd": { "command": "qmd", "args": ["mcp"] } } }');
