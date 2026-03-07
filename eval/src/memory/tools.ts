dimport { FSMemory } from "./fs/fs-memory";
import {
    qmdSearch,
    qmdVectorSearch,
    qmdDeepSearch,
    qmdGet,
    qmdStatus,
    formatQmdResults,
} from "./qmd/qmd";

/** Tool schemas (MCP format equivalents for the agent) */
export const MEMORY_TOOLS = [
    {
        name: "memory_read",
        description: "Read a memory file. Path is relative to memory/ dir.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Relative path, e.g. 'AGENT.md' or 'topics/projects.md'" }
            },
            required: ["path"]
        }
    },
    {
        name: "memory_write",
        description: "Write or append to a memory file.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string" },
                content: { type: "string" },
                mode: { type: "string", enum: ["write", "append"] }
            },
            required: ["path", "content"]
        }
    },
    {
        name: "memory_list",
        description: "List files in a memory subdirectory.",
        input_schema: {
            type: "object",
            properties: {
                subdir: { type: "string", description: "Subdirectory (e.g. 'journals', 'topics')" }
            }
        }
    },
    {
        name: "journal_append",
        description: "Append a required entry to the monthly journal. Must be called every session at major milestones or end.",
        input_schema: {
            type: "object",
            properties: {
                projectDir: { type: "string", description: "Relative path to project from root (e.g., 'web/plugins/my-plugin')" },
                context: { type: "string", description: "Optional short free context (e.g., 'v1.2' or 'webhook architecture')" },
                summary: { type: "string", description: "Natural summary of what was done, discussed, decided (2-10 lines)." }
            },
            required: ["projectDir", "context", "summary"]
        }
    },
    // ── QMD local search tools ─────────────────────────────────────────────
    {
        name: "qmd_search",
        description: "Fast BM25 keyword search across indexed local files (memory, sessions, notes). Best for exact terms, IDs, structured notes.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query" },
                collection: { type: "string", description: "Limit to a specific collection: 'memory', 'sessions', or 'notes'" },
                n: { type: "number", description: "Number of results to return (default 5)" }
            },
            required: ["query"]
        }
    },
    {
        name: "qmd_vector_search",
        description: "Semantic vector search across indexed local files. Best for concepts and meaning when exact keywords are unknown. Requires embeddings to be built.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (natural language)" },
                collection: { type: "string", description: "Limit to a specific collection: 'memory', 'sessions', or 'notes'" },
                n: { type: "number", description: "Number of results to return (default 5)" }
            },
            required: ["query"]
        }
    },
    {
        name: "qmd_deep_search",
        description: "Hybrid search: BM25 + vector + query expansion + re-ranking. Highest quality (~2-3s). Use when qmd_search misses or for best recall on any query.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query" },
                collection: { type: "string", description: "Limit to a specific collection: 'memory', 'sessions', or 'notes'" },
                n: { type: "number", description: "Number of results to return (default 5)" }
            },
            required: ["query"]
        }
    },
    {
        name: "qmd_get",
        description: "Retrieve the full content of a document by its file path or docid.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path (relative or absolute) or QMD docid" }
            },
            required: ["path"]
        }
    },
    {
        name: "qmd_status",
        description: "Check QMD index health: number of collections, documents, and vector chunks.",
        input_schema: {
            type: "object",
            properties: {}
        }
    }
] as const;

/** Dispatch a tool call */
export function executeMemoryTool(
    toolName: string,
    args: Record<string, string>,
    fs: FSMemory
): string {
    switch (toolName) {
        case "memory_read":
            return fs.readFile(args.path);
        case "memory_write":
            fs.writeFile(args.path, args.content, (args.mode as "write" | "append") ?? "write");
            return `Written to ${args.path}`;
        case "memory_list":
            return JSON.stringify(fs.listFiles(args.subdir ?? ""));
        case "journal_append":
            fs.appendJournal(args.projectDir, args.context, args.summary);
            return "Appended to monthly journal successfully.";
        // ── QMD search tools ───────────────────────────────────────────────
        case "qmd_search": {
            const results = qmdSearch(args.query, {
                collection: args.collection,
                n: args.n ? Number(args.n) : undefined,
            });
            return formatQmdResults(results);
        }
        case "qmd_vector_search": {
            const results = qmdVectorSearch(args.query, {
                collection: args.collection,
                n: args.n ? Number(args.n) : undefined,
            });
            return formatQmdResults(results);
        }
        case "qmd_deep_search": {
            const results = qmdDeepSearch(args.query, {
                collection: args.collection,
                n: args.n ? Number(args.n) : undefined,
            });
            return formatQmdResults(results);
        }
        case "qmd_get":
            return qmdGet(args.path) || `[Document not found: ${args.path}]`;
        case "qmd_status": {
            const status = qmdStatus();
            if (!status) return "[QMD status unavailable — is QMD installed and indexed?]";
            return JSON.stringify(status, null, 2);
        }
        default:
            return `Unknown tool: ${toolName}`;
    }
}
