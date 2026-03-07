import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { FSMemory } from "./fs/fs-memory";
import { executeMemoryTool } from "./tools";
import { rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(process.cwd(), "test_memory_dir");

describe("FSMemory", () => {
    beforeAll(() => {
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    afterAll(() => {
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    test("Initializes directories properly", () => {
        const fs = new FSMemory(TEST_DIR);
        expect(existsSync(TEST_DIR)).toBe(true);
        expect(existsSync(join(TEST_DIR, "journals"))).toBe(true);
        expect(existsSync(join(TEST_DIR, "topics"))).toBe(true);
    });

    test("Appends to monthly journal", () => {
        const fs = new FSMemory(TEST_DIR);
        fs.appendJournal("src/test", "first entry", "Summary of what was done.");

        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7);
        const journalFile = join(TEST_DIR, "journals", `${yearMonth}.journal.md`);

        expect(existsSync(journalFile)).toBe(true);
        const content = readFileSync(journalFile, "utf-8");
        expect(content).toContain("src/test");
        expect(content).toContain("first entry");
        expect(content).toContain("Summary of what was done.");
    });

    test("Skips journal for private projects", () => {
        const fs = new FSMemory(TEST_DIR);
        const beforeCount = fs.listFiles("journals").length;

        fs.appendJournal("private-project/test", "secret context", "secret summary");

        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7);
        const journalFile = join(TEST_DIR, "journals", `${yearMonth}.journal.md`);

        if (existsSync(journalFile)) {
            const content = readFileSync(journalFile, "utf-8");
            expect(content).not.toContain("secret context");
        }
    });

    test("Reads and Writes via tools", () => {
        const fs = new FSMemory(TEST_DIR);
        executeMemoryTool("memory_write", { path: "hello.txt", content: "World", mode: "write" }, fs);
        const result = executeMemoryTool("memory_read", { path: "hello.txt" }, fs);
        expect(result).toBe("World");
    });
});
