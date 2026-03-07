import type { Plugin } from "@opencode-ai/plugin";
import { basename, join } from "node:path";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";

const TARGET_DIRECTORY_NAME = "adival";
const JSON_OUTPUT_DIR = "manager/messages";
const CHAT_OUTPUT_DIR = "manager/chats";
const TOOL_TEXT_LIMIT = 400;

function sanitizeFilename(input: string): string {
  const value = (input || "untitled")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return value.slice(0, 120) || "untitled";
}

function getSessionInfo(result: any): any {
  if (!result) return undefined;
  if (result.data) return result.data;
  return result;
}

async function removeOldExports(
  outputDir: string,
  sessionID: string,
  nextFileName: string,
  extension: string
): Promise<void> {
  const files = await readdir(outputDir);
  const suffix = `--${sessionID}.${extension}`;

  await Promise.all(
    files
      .filter(file => file.endsWith(suffix) && file !== nextFileName)
      .map(file => unlink(join(outputDir, file)))
  );
}

function yamlEscape(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toBlock(value: unknown, language: string): string {
  if (value === undefined || value === null) return "";
  const ticks = "```";
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const truncated = raw.length > TOOL_TEXT_LIMIT;
  const body = truncated ? `${raw.slice(0, TOOL_TEXT_LIMIT)}\n(extra part truncated)` : raw;
  return `\n\n${ticks}${language ? language : "text"}\n${body}\n${ticks}\n`;
}

function renderChatMarkdown(exportedJson: string, sessionID: string, title: string): string {
  let data: any;
  try {
    data = JSON.parse(exportedJson);
  } catch {
    return `---\nsession_id: ${sessionID}\ntitle: "${yamlEscape(title)}"\n---\n\nFailed to parse exported session JSON.`;
  }

  const lines: string[] = [];
  lines.push("---");
  lines.push(`session_id: ${sessionID}`);
  lines.push(`title: "${yamlEscape(title)}"`);
  lines.push("---");
  lines.push("");

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  for (const message of messages) {
    const roleRaw = message?.info?.role;
    const role = typeof roleRaw === "string" ? roleRaw : "assistant";
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    const parts = Array.isArray(message?.parts) ? message.parts : [];

    const textParts = parts
      .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
      .map((part: any) => part.text.trim())
      .filter((text: string) => text.length > 0);

    if (textParts.length > 0) {
      lines.push(`## ${roleLabel}`);
      lines.push("");
      lines.push(textParts.join("\n\n"));
      lines.push("");
    }

    for (const part of parts) {
      if (part?.type !== "tool") continue;
      const toolName = typeof part?.tool === "string" ? part.tool : "unknown";
      lines.push(`## Tool: ${toolName}`);
      lines.push("");

      const status = part?.state?.status;
      if (typeof status === "string") {
        lines.push(`Status: ${status}`);
        lines.push("");
      }

      if (part?.state?.input !== undefined) {
        lines.push("### Input");
        lines.push(toBlock(part.state.input, "json").trimEnd());
        lines.push("");
      }

      if (part?.state?.output !== undefined) {
        lines.push("### Output");
        lines.push(toBlock(part.state.output, "text").trimEnd());
        lines.push("");
      }
    }
  }

  return lines.join("\n").trim() + "\n";
}

async function fetchSession(client: any, sessionID: string, directory: string): Promise<any> {
  try {
    const result = await client.session.get({ sessionID, directory });
    return getSessionInfo(result);
  } catch {
    const result = await client.session.get({
      path: { sessionID },
      query: { directory },
    });
    return getSessionInfo(result);
  }
}

export const SessionAutoExport: Plugin = async ({ client, directory, $ }) => {
  const jsonOutputAbsoluteDir = join(directory, JSON_OUTPUT_DIR);
  const chatOutputAbsoluteDir = join(directory, CHAT_OUTPUT_DIR);
  await mkdir(jsonOutputAbsoluteDir, { recursive: true });
  await mkdir(chatOutputAbsoluteDir, { recursive: true });
  const inFlightBySession = new Map<string, Promise<void>>();

  return {
    event: async ({ event }) => {
      const isSessionInfoEvent = event.type === "session.updated";
      const isSessionIdleEvent = event.type === "session.idle";
      if (!isSessionInfoEvent && !isSessionIdleEvent) return;

      const sessionID =
        (isSessionInfoEvent ? event.properties?.info?.id : event.properties?.sessionID) || "";
      if (!sessionID) return;

      const previous = inFlightBySession.get(sessionID) || Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          try {
            const session = isSessionInfoEvent
              ? event.properties?.info
              : await fetchSession(client as any, sessionID, directory);
            if (!session) return;

            if (basename(session.directory || "") !== TARGET_DIRECTORY_NAME) return;

            const title = sanitizeFilename(session.title);
            const jsonFileName = `${title}--${sessionID}.json`;
            const jsonFilePath = join(jsonOutputAbsoluteDir, jsonFileName);
            const chatFileName = `${title}--${sessionID}.md`;
            const chatFilePath = join(chatOutputAbsoluteDir, chatFileName);

            await removeOldExports(jsonOutputAbsoluteDir, sessionID, jsonFileName, "json");
            await removeOldExports(chatOutputAbsoluteDir, sessionID, chatFileName, "md");

            const exported = await $`opencode export ${sessionID}`.quiet().text();
            const markdown = renderChatMarkdown(exported, sessionID, session.title || title);

            await writeFile(jsonFilePath, exported, "utf8");
            await writeFile(chatFilePath, markdown, "utf8");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (client.app?.log) {
              await client.app.log({
                body: {
                  service: "session-auto-export",
                  level: "warn",
                  message: "Failed to export session",
                  extra: {
                    sessionID,
                    error: message,
                  },
                },
              });
            }
          }
        })
        .finally(() => {
          if (inFlightBySession.get(sessionID) === next) {
            inFlightBySession.delete(sessionID);
          }
        });

      inFlightBySession.set(sessionID, next);
      await next;
    },
  };
};
