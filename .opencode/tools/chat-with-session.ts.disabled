import { tool } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk";

const HELPER_TITLE_PREFIX = "__meta_summary__:";

function getSessionInfo(result: any): any {
  if (!result) return undefined;
  if (result.data) return result.data;
  return result;
}

function extractTextFromParts(parts: any[]): string {
  return parts
    .filter(part => part?.type === "text" && typeof part?.text === "string")
    .map(part => part.text)
    .join("\n\n")
    .trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/session`);
      if (response.ok) return;
    } catch {
      // Keep retrying.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for opencode serve");
}

export default tool({
  description:
    "Fork a session, send a prompt, return assistant response, and delete the temporary fork.",
  args: {
    session_id: tool.schema.string().describe("Session ID to fork and chat with"),
    prompt: tool.schema.string().describe("Prompt to send to the forked session"),
  },
  async execute(args, context) {
    const helperTitle = `${HELPER_TITLE_PREFIX}${args.session_id}:${Date.now()}`;
    const port = 42000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = Bun.spawn(
      ["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: context.directory,
        stdout: "ignore",
        stderr: "ignore",
      }
    );
    const client = createOpencodeClient({ baseUrl, directory: context.directory });

    let forkSessionID = "";
    let responseText = "no response";

    try {
      await waitForServer(baseUrl);

      const forkResult = await client.session.fork({
        path: { id: args.session_id },
        query: { directory: context.directory },
      });
      const forkInfo = getSessionInfo(forkResult);
      forkSessionID = String(forkInfo?.id || "");
      if (!forkSessionID) throw new Error("Failed to fork session");

      await client.session.update({
        path: { id: forkSessionID },
        query: { directory: context.directory },
        body: { title: helperTitle },
      });

      const promptResult = await client.session.prompt({
        path: { id: forkSessionID },
        query: { directory: context.directory },
        body: {
          system:
            "You are replying inside a temporary helper session. Do not call any tools. Respond with plain text only.",
          tools: {
            "chat-with-session": false,
          },
          parts: [{ type: "text", text: args.prompt }],
        },
      });

      const promptInfo = getSessionInfo(promptResult);
      const extracted = extractTextFromParts(
        Array.isArray(promptInfo?.parts) ? promptInfo.parts : []
      );
      if (extracted) responseText = extracted;
    } catch {
      responseText = "no response";
    } finally {
      if (forkSessionID) {
        try {
          await client.session.delete({
            path: { id: forkSessionID },
            query: { directory: context.directory },
          });
        } catch (error) {
          console.error("chat-with-session cleanup failed", {
            session_id: args.session_id,
            title: helperTitle,
            fork_session_id: forkSessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        server.kill();
      } catch {
        // Ignore server shutdown errors.
      }
    }

    return responseText;
  },
});
