import { FSMemory } from "./fs-memory";

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
        default:
            return `Unknown tool: ${toolName}`;
    }
}
