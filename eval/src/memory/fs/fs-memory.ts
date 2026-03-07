import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "fs";
import { join, resolve, relative } from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = resolve(process.cwd());
const MEMORY_DIR = join(PROJECT_ROOT, "memory");
const JOURNAL_DIR = join(MEMORY_DIR, "journals");

export class FSMemory {
    private baseDir: string;
    private journalDir: string;
    private projectRoot: string;

    constructor(baseDir: string = MEMORY_DIR) {
        this.baseDir = baseDir;
        this.journalDir = join(baseDir, "journals");
        this.projectRoot = PROJECT_ROOT;
        this.ensureDirs();
    }

    /** Create directory structure on init */
    private ensureDirs(): void {
        for (const dir of [this.baseDir, this.journalDir, join(this.baseDir, "topics")]) {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }
    }

    /** Load active context for system prompt injection */
    loadContext(): string {
        const agentMd = join(this.baseDir, "AGENT.md");
        if (existsSync(agentMd)) return readFileSync(agentMd, "utf-8");
        return "";
    }

    /** Gets a relative path from the project root */
    private getRelativeProjectDir(targetPath: string): string {
        const rel = relative(this.projectRoot, resolve(targetPath));
        return rel === "" ? "." : rel;
    }

    /**
     * Appends an entry to the monthly journal file.
     * Format: ## YYYY-MM-DD HH:MM | [project directory] | [free context]
     * Ensures atomic append mapping to bash `>>`.
     */
    appendJournal(projectDir: string, context: string, summary: string): void {
        // Check exclusions
        const relProjectDir = this.getRelativeProjectDir(projectDir).replace(/\\/g, "/");
        if (relProjectDir.startsWith("private-project")) {
            return; // Exception rule: no journal, no log for private-project
        }

        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7); // YYYY-MM
        const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const time = now.toTimeString().slice(0, 5); // HH:MM

        const journalFile = join(this.journalDir, `${yearMonth}.journal.md`);

        // As explicitly requested by the user, mimicking atomic bash `>>` (append).
        // Node.js appendFileSync uses O_APPEND by default which is exactly what bash `>>` does.
        const entry = `## ${date} ${time} | ${relProjectDir} | ${context}\n${summary}\n\n`;
        appendFileSync(journalFile, entry);
    }

    /** Generic read (for memory_read tool) */
    readFile(relPath: string): string {
        const abs = join(this.baseDir, relPath);
        if (!existsSync(abs)) return `[File not found: ${relPath}]`;
        return readFileSync(abs, "utf-8");
    }

    /** Generic write/append (for memory_write tool) */
    writeFile(relPath: string, content: string, mode: "write" | "append" = "write"): void {
        const abs = join(this.baseDir, relPath);
        const lastSlash = Math.max(abs.lastIndexOf("/"), abs.lastIndexOf("\\"));
        const dir = lastSlash >= 0 ? abs.substring(0, lastSlash) : this.baseDir;
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        if (mode === "append") {
            appendFileSync(abs, content);
        } else {
            writeFileSync(abs, content);
        }
    }

    /** List files in a subdirectory (for memory_list tool) */
    listFiles(subdir: string = ""): string[] {
        const dir = join(this.baseDir, subdir);
        if (!existsSync(dir)) return [];
        return readdirSync(dir);
    }

    /** Build context string for system prompt injection */
    buildSystemPromptContext(): string {
        const ctx = this.loadContext();
        if (!ctx) return "";
        return `<memory>\n${ctx}\n</memory>`;
    }
}
