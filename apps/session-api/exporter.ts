import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExportedSession, SessionLifecycle } from "./types.ts";

function sanitizeFilename(input: string): string {
  const value = (input || "untitled")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return value.slice(0, 120) || "untitled";
}

function getLastSentences(text: string, count: number): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
  return sentences.slice(-count).join(" ");
}

function convertToMarkdown(exported: ExportedSession, status: SessionLifecycle): string {
  const lines: string[] = [];
  const title = exported.info?.title || "Untitled";
  const sessionID = exported.info?.id || "unknown";
  const updatedMillis = exported.info?.time?.updated || Date.now();
  const lastUpdated = new Date(updatedMillis).toISOString();

  lines.push(`# Session: ${title}`);
  lines.push("");
  lines.push(`**ID:** ${sessionID}`);
  lines.push(`**Status:** ${status}`);
  lines.push(`**Last Updated:** ${lastUpdated}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const message of exported.messages || []) {
    const role = message.info?.role;
    const parts = message.parts || [];

    const textParts = parts
      .filter(part => part.type === "text" && typeof part.text === "string")
      .map(part => part.text?.trim() || "")
      .filter(Boolean);

    if (textParts.length > 0) {
      lines.push(`## ${role === "user" ? "User" : "Assistant"}`);
      lines.push("");
      lines.push(textParts.join("\n\n"));
      lines.push("");
    }

    if (role === "assistant") {
      const reasoningParts = parts
        .filter(part => part.type === "reasoning" && typeof part.text === "string")
        .map(part => part.text?.trim() || "")
        .filter(Boolean);

      if (reasoningParts.length > 0) {
        const snippet = getLastSentences(reasoningParts.join(" "), 3);
        if (snippet) {
          lines.push(`> **Working on:** ${snippet}`);
          lines.push("");
        }
      }
    }

    for (const part of parts) {
      if (part.type !== "tool") continue;
      lines.push(`## Tool: ${part.tool || "unknown"}`);
      lines.push(`**Description:** ${(part.state?.title || "").replace(/\n/g, " ").trim()}`);
      lines.push(`**Status:** ${part.state?.status || "unknown"}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export class SessionExporter {
  constructor(
    private readonly projectRoot: string,
    private readonly chatsDir: string
  ) {}

  private exportSessionRaw(sessionID: string): ExportedSession {
    const proc = Bun.spawnSync(["opencode", "export", sessionID], {
      cwd: this.projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (proc.exitCode !== 0) {
      const errorText = new TextDecoder().decode(proc.stderr).trim();
      throw new Error(errorText || `opencode export failed for ${sessionID}`);
    }

    const output = new TextDecoder().decode(proc.stdout);
    return JSON.parse(output) as ExportedSession;
  }

  private async removeOldSessionExports(sessionID: string, keepFilename: string): Promise<void> {
    try {
      const files = await readdir(this.chatsDir);
      const oldFiles = files.filter(
        file => file.endsWith(`--${sessionID}.md`) && file !== keepFilename
      );
      for (const file of oldFiles) {
        await unlink(join(this.chatsDir, file));
      }
    } catch {
      // Best effort cleanup.
    }
  }

  async exportSession(
    sessionID: string,
    status: SessionLifecycle,
    fallbackTitle: string
  ): Promise<{
    filePath: string;
    updatedAt: number;
    hasActiveTool: boolean;
    hasVisibleContent: boolean;
  }> {
    await mkdir(this.chatsDir, { recursive: true });

    const exported = this.exportSessionRaw(sessionID);
    const title = exported.info?.title || fallbackTitle || "Untitled";
    const filename = `${sanitizeFilename(title)}--${sessionID}.md`;
    const filePath = join(this.chatsDir, filename);
    const updatedAt = exported.info?.time?.updated || Date.now();
    const hasActiveTool = (exported.messages || []).some(message =>
      (message.parts || []).some(part => {
        if (part.type !== "tool") return false;
        const toolStatus = String(part.state?.status || "").toLowerCase();
        return toolStatus === "running" || toolStatus === "pending";
      })
    );
    const hasVisibleContent = (exported.messages || []).some(message =>
      (message.parts || []).some(part => {
        if (part.type === "text") {
          return typeof part.text === "string" && part.text.trim().length > 0;
        }
        if (part.type === "tool") {
          return true;
        }
        return false;
      })
    );

    await this.removeOldSessionExports(sessionID, filename);
    await writeFile(filePath, convertToMarkdown(exported, status), "utf8");
    return { filePath, updatedAt, hasActiveTool, hasVisibleContent };
  }

  async readLatestTail(sessionID: string, maxChars: number): Promise<string> {
    try {
      const files = await readdir(this.chatsDir);
      const match = files.find(file => file.endsWith(`--${sessionID}.md`));
      if (!match) return "";
      const content = await Bun.file(join(this.chatsDir, match)).text();
      return content.slice(-maxChars);
    } catch {
      return "";
    }
  }
}
