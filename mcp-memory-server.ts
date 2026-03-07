#!/usr/bin/env bun
/**
 * Memory MCP Server
 *
 * Exposes FSMemory as real MCP tools so opencode can call them.
 * Register in opencode.json under "mcp" to activate.
 *
 * Tools provided:
 *   memory_read, memory_write, memory_list, journal_append
 *
 * Run:
 *   bun run mcp-memory-server.ts
 *
 * Register in opencode.json:
 *   "memory": {
 *     "type": "local",
 *     "command": ["bun", "run", "mcp-memory-server.ts"]
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FSMemory } from "./eval/src/memory/fs-memory";

const fs = new FSMemory();
const server = new McpServer({ name: "memory", version: "1.0.0" });

// ── memory_read ───────────────────────────────────────────────────────────────
server.tool(
    "memory_read",
    "Read a file from the memory system. Path is relative to memory/ dir (e.g. 'AGENT.md', 'journals/2026-03.journal.md', 'profile.md').",
    { path: z.string().describe("Relative path inside memory/") },
    async ({ path }) => ({
        content: [{ type: "text", text: fs.readFile(path) }],
    })
);

// ── memory_write ──────────────────────────────────────────────────────────────
server.tool(
    "memory_write",
    "Write or append to a file in the memory system.",
    {
        path: z.string().describe("Relative path inside memory/"),
        content: z.string().describe("Content to write"),
        mode: z.enum(["write", "append"]).default("write").describe("'write' replaces the file, 'append' adds to it"),
    },
    async ({ path, content, mode }) => {
        fs.writeFile(path, content, mode);
        return { content: [{ type: "text", text: `Written to memory/${path} (mode: ${mode})` }] };
    }
);

// ── memory_list ───────────────────────────────────────────────────────────────
server.tool(
    "memory_list",
    "List files in a memory subdirectory.",
    { subdir: z.string().default("").describe("Subdirectory to list (e.g. 'journals', 'topics'). Leave empty for root.") },
    async ({ subdir }) => {
        const files = fs.listFiles(subdir);
        return { content: [{ type: "text", text: files.length ? files.join("\n") : "(empty)" }] };
    }
);

// ── journal_append ────────────────────────────────────────────────────────────
server.tool(
    "journal_append",
    "REQUIRED at every session milestone and end-of-session. Appends an entry to the monthly journal with timestamp, project path, and summary.",
    {
        projectDir: z.string().describe("Relative path to the project being worked on (e.g. 'eval/src/memory')"),
        context: z.string().describe("Short topic tag (e.g. 'condensation pipeline', 'auth bug fix')"),
        summary: z.string().describe("2-10 line natural summary of what was done, decided, or discovered this session."),
    },
    async ({ projectDir, context, summary }) => {
        fs.appendJournal(projectDir, context, summary);
        const now = new Date();
        const month = now.toISOString().slice(0, 7);
        return {
            content: [{
                type: "text",
                text: `Journal entry appended to memory/journals/${month}.journal.md`,
            }],
        };
    }
);

// ── Start server ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
