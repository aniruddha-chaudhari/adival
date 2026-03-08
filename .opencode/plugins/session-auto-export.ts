import type { Plugin } from "@opencode-ai/plugin";
import { basename, join } from "node:path";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";

const TARGET_DIRECTORY_NAME = "adival";
const JSON_OUTPUT_DIR = "manager/messages";
const CHAT_OUTPUT_DIR = "manager/chats";
const TOOL_TEXT_LIMIT = 400;
const HELPER_TITLE_PREFIX = "__meta_summary__:";

type SummaryData = {
  description: string;
  important_lessons: string[];
  gotchas: string[];
  future_agent_instructions: string[];
};

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

function normalizeLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim();
}

function normalizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map(item => normalizeLine(item))
    .filter(item => item.length > 0)
    .slice(0, 8);
}

function fallbackSummary(sessionTitle: string): SummaryData {
  return {
    description: `Conversation about: ${normalizeLine(sessionTitle) || "Untitled session"}`,
    important_lessons: [],
    gotchas: [],
    future_agent_instructions: [],
  };
}

function parseSummaryJson(text: string, sessionTitle: string): SummaryData {
  const fallback = fallbackSummary(sessionTitle);
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    const description = normalizeLine(parsed?.description) || fallback.description;
    return {
      description,
      important_lessons: normalizeList(parsed?.important_lessons),
      gotchas: normalizeList(parsed?.gotchas),
      future_agent_instructions: normalizeList(parsed?.future_agent_instructions),
    };
  } catch {
    return {
      ...fallback,
      description: "Description generation failed",
    };
  }
}

function heuristicSummaryFromExportedJson(exportedJson: string, sessionTitle: string): SummaryData {
  const fallback = fallbackSummary(sessionTitle);

  let data: any;
  try {
    data = JSON.parse(exportedJson);
  } catch {
    return fallback;
  }

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const userTexts: string[] = [];
  const assistantTexts: string[] = [];
  const gotchas: string[] = [];

  for (const message of messages) {
    const role = message?.info?.role;
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    const text = parts
      .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
      .map((part: any) => normalizeLine(part.text))
      .filter((x: string) => x.length > 0)
      .join(" ");

    if (!text) continue;
    if (role === "user") userTexts.push(text);
    if (role === "assistant") {
      assistantTexts.push(text);
      const lower = text.toLowerCase();
      if (
        lower.includes("avoid") ||
        lower.includes("don't") ||
        lower.includes("never") ||
        lower.includes("caution") ||
        lower.includes("warning")
      ) {
        gotchas.push(text.slice(0, 160));
      }
    }
  }

  const lastUser = userTexts[userTexts.length - 1] || "";
  const description = lastUser ? `User asked: ${lastUser.slice(0, 180)}` : fallback.description;

  const lastAssistant = assistantTexts[assistantTexts.length - 1] || "";
  const lessons = lastAssistant
    ? lastAssistant
        .split(/(?<=[.!?])\s+/)
        .map(x => normalizeLine(x))
        .filter(x => x.length > 0)
        .slice(0, 3)
    : [];

  return {
    description,
    important_lessons: lessons,
    gotchas: gotchas.slice(0, 3),
    future_agent_instructions: [
      "Use this file's frontmatter first; only read full transcript if details are missing.",
    ],
  };
}

function mergeSummaryWithHeuristics(
  summary: SummaryData,
  exportedJson: string,
  sessionTitle: string
): SummaryData {
  const heuristic = heuristicSummaryFromExportedJson(exportedJson, sessionTitle);
  const placeholderDescription =
    summary.description === "Description generation failed" ||
    summary.description.startsWith("Conversation about:");

  return {
    description: placeholderDescription ? heuristic.description : summary.description,
    important_lessons:
      summary.important_lessons.length > 0
        ? summary.important_lessons
        : heuristic.important_lessons,
    gotchas: summary.gotchas.length > 0 ? summary.gotchas : heuristic.gotchas,
    future_agent_instructions:
      summary.future_agent_instructions.length > 0
        ? summary.future_agent_instructions
        : heuristic.future_agent_instructions,
  };
}

function isHelperSessionTitle(title: unknown): boolean {
  return typeof title === "string" && title.startsWith(HELPER_TITLE_PREFIX);
}

function appendYamlList(lines: string[], key: string, values: string[]): void {
  if (values.length === 0) {
    lines.push(`${key}: []`);
    return;
  }
  lines.push(`${key}:`);
  for (const value of values) {
    lines.push(`  - "${yamlEscape(value)}"`);
  }
}

function toBlock(value: unknown, language: string): string {
  if (value === undefined || value === null) return "";
  const ticks = "```";
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const truncated = raw.length > TOOL_TEXT_LIMIT;
  const body = truncated ? `${raw.slice(0, TOOL_TEXT_LIMIT)}\n(extra part truncated)` : raw;
  return `\n\n${ticks}${language ? language : "text"}\n${body}\n${ticks}\n`;
}

function renderChatMarkdown(
  exportedJson: string,
  sessionID: string,
  title: string,
  summary: SummaryData
): string {
  let data: any;
  try {
    data = JSON.parse(exportedJson);
  } catch {
    const lines = [
      "---",
      `session_id: ${sessionID}`,
      `title: "${yamlEscape(title)}"`,
      `description: "${yamlEscape(summary.description)}"`,
    ];
    appendYamlList(lines, "important_lessons", summary.important_lessons);
    appendYamlList(lines, "gotchas", summary.gotchas);
    appendYamlList(lines, "future_agent_instructions", summary.future_agent_instructions);
    lines.push("---", "", "Failed to parse exported session JSON.");
    return lines.join("\n");
  }

  const lines: string[] = [];
  lines.push("---");
  lines.push(`session_id: ${sessionID}`);
  lines.push(`title: "${yamlEscape(title)}"`);
  lines.push(`description: "${yamlEscape(summary.description)}"`);
  appendYamlList(lines, "important_lessons", summary.important_lessons);
  appendYamlList(lines, "gotchas", summary.gotchas);
  appendYamlList(lines, "future_agent_instructions", summary.future_agent_instructions);
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

async function updateSessionTitle(
  client: any,
  sessionID: string,
  directory: string,
  title: string
): Promise<void> {
  try {
    await client.session.update({ sessionID, directory, title });
  } catch {
    await client.session.update({
      path: { sessionID },
      query: { directory },
      body: { title },
    });
  }
}

async function forkSession(client: any, sessionID: string, directory: string): Promise<any> {
  try {
    return getSessionInfo(await client.session.fork({ sessionID, directory }));
  } catch {
    return getSessionInfo(
      await client.session.fork({
        path: { sessionID },
        query: { directory },
      })
    );
  }
}

async function deleteSession(client: any, sessionID: string, directory: string): Promise<void> {
  try {
    await client.session.delete({ sessionID, directory });
  } catch {
    await client.session.delete({
      path: { sessionID },
      query: { directory },
    });
  }
}

function extractTextFromParts(parts: any[]): string {
  return parts
    .filter(part => part?.type === "text" && typeof part?.text === "string")
    .map(part => part.text)
    .join("\n\n")
    .trim();
}

async function promptSessionForSummary(
  client: any,
  sessionID: string,
  directory: string,
  prompt: string
): Promise<string> {
  try {
    const result = await client.session.prompt({
      sessionID,
      directory,
      parts: [{ type: "text", text: prompt }],
    });
    const info = getSessionInfo(result);
    const fromPrompt = extractTextFromParts(Array.isArray(info?.parts) ? info.parts : []);
    if (fromPrompt) return fromPrompt;
  } catch {
    const result = await client.session.prompt({
      path: { sessionID },
      query: { directory },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    });
    const info = getSessionInfo(result);
    const fromPrompt = extractTextFromParts(Array.isArray(info?.parts) ? info.parts : []);
    if (fromPrompt) return fromPrompt;
  }

  try {
    const messages = await client.session.messages({ sessionID, directory, limit: 10 });
    const list = getSessionInfo(messages);
    const rows = Array.isArray(list) ? list : [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (row?.info?.role !== "assistant") continue;
      const text = extractTextFromParts(Array.isArray(row?.parts) ? row.parts : []);
      if (text) return text;
    }
  } catch {
    try {
      const messages = await client.session.messages({
        path: { sessionID },
        query: { directory, limit: 10 },
      });
      const list = getSessionInfo(messages);
      const rows = Array.isArray(list) ? list : [];
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (row?.info?.role !== "assistant") continue;
        const text = extractTextFromParts(Array.isArray(row?.parts) ? row.parts : []);
        if (text) return text;
      }
    } catch {
      return "";
    }
  }

  return "";
}

async function promptSessionForSummaryViaCli(
  $: any,
  sessionID: string,
  prompt: string
): Promise<string> {
  try {
    return (await $`opencode run --session ${sessionID} ${prompt}`.quiet().text()).trim();
  } catch {
    return "";
  }
}

async function generateSummaryFromHelperSession(
  client: any,
  session: any,
  directory: string,
  ignoredSessionIDs: Set<string>,
  $: any
): Promise<SummaryData> {
  const sessionID = String(session?.id || "");
  const sessionTitle = String(session?.title || "");
  const fallback = fallbackSummary(sessionTitle);
  if (!sessionID) return fallback;

  let helperSessionID = "";
  try {
    const helper = await forkSession(client, sessionID, directory);
    helperSessionID = String(helper?.id || "");
    if (!helperSessionID) return fallback;

    ignoredSessionIDs.add(helperSessionID);
    const helperTitle = `${HELPER_TITLE_PREFIX}${sessionID}`;
    await updateSessionTitle(client, helperSessionID, directory, helperTitle);

    const prompt = [
      "Summarize this conversation for future coding agents.",
      "Return STRICT JSON only (no markdown, no prose outside JSON) with keys:",
      "Output must be directly parsable by JSON.parse().",
      `Schema:
        {
          "description": string,
          "important_lessons": string[],
          "gotchas": string[],
          "future_agent_instructions": string[]
        }
      `,
      "Keep each item very concise and actionable.",
      "Add item only if it is very useful to the future coding agents and saves them extra work and time.",
      "If no items for a list, return an empty array.",
    ].join("\n");

    const cliText = await promptSessionForSummaryViaCli($, helperSessionID, prompt);
    const responseText =
      cliText || (await promptSessionForSummary(client, helperSessionID, directory, prompt));
    return parseSummaryJson(responseText, sessionTitle);
  } catch {
    return {
      ...fallback,
      description: "Description generation failed",
    };
  } finally {
    if (helperSessionID) {
      try {
        await deleteSession(client, helperSessionID, directory);
      } catch {
        // Ignore cleanup errors.
      }
      ignoredSessionIDs.delete(helperSessionID);
    }
  }
}

export const SessionAutoExport: Plugin = async ({ client, directory, $ }) => {
  const jsonOutputAbsoluteDir = join(directory, JSON_OUTPUT_DIR);
  const chatOutputAbsoluteDir = join(directory, CHAT_OUTPUT_DIR);
  await mkdir(jsonOutputAbsoluteDir, { recursive: true });
  await mkdir(chatOutputAbsoluteDir, { recursive: true });
  const inFlightBySession = new Map<string, Promise<void>>();
  const ignoredSessionIDs = new Set<string>();

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

            if (ignoredSessionIDs.has(session.id) || isHelperSessionTitle(session.title)) {
              if (session.id && isHelperSessionTitle(session.title)) {
                try {
                  await deleteSession(client as any, session.id, directory);
                } catch {
                  // Ignore cleanup errors.
                }
              }
              return;
            }

            if (basename(session.directory || "") !== TARGET_DIRECTORY_NAME) return;

            const title = sanitizeFilename(session.title);
            const jsonFileName = `${title}--${sessionID}.json`;
            const jsonFilePath = join(jsonOutputAbsoluteDir, jsonFileName);
            const chatFileName = `${title}--${sessionID}.md`;
            const chatFilePath = join(chatOutputAbsoluteDir, chatFileName);

            await removeOldExports(jsonOutputAbsoluteDir, sessionID, jsonFileName, "json");
            await removeOldExports(chatOutputAbsoluteDir, sessionID, chatFileName, "md");

            const exported = await $`opencode export ${sessionID}`.quiet().text();
            const summary = await generateSummaryFromHelperSession(
              client as any,
              session,
              directory,
              ignoredSessionIDs,
              $
            );
            const mergedSummary = mergeSummaryWithHeuristics(
              summary,
              exported,
              session.title || title
            );
            const markdown = renderChatMarkdown(
              exported,
              sessionID,
              session.title || title,
              mergedSummary
            );

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
