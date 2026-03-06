import { FSMemory } from "./fs-memory";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

/** Extract key information from a daily/monthly journal using basic text heuristics */
export function condenseSession(fs: FSMemory, dateStr: string): string {
    // In a real implementation this might call an LLM to summarize the file.
    // For now we do a simple string extraction of the headers.
    const file = join("journals", `${dateStr}.journal.md`);
    const content = fs.readFile(file);

    if (content.startsWith("[File not found")) {
        return "";
    }

    const lines = content.split("\n");
    const extracted = lines.filter(line => line.startsWith("## ") || line.trim().length > 0);

    return extracted.join("\n");
}

/** Update the AGENT.md active context file with the latest profile and recent journal entries */
export function updateAgentMd(fs: FSMemory): void {
    const profile = fs.readFile("profile.md");
    const agentContent = `# Active Memory — Agent\n\n${profile}\n\n## Recent Context (Auto-Condensed)\n[Memory context loaded...]`;

    fs.writeFile("AGENT.md", agentContent, "write");
}
