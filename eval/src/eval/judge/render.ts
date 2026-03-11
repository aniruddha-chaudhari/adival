/**
 * Agent Output Renderer
 *
 * Converts raw JSONL agent output into clean markdown for judge evaluation.
 * Replaces the old approach of sending truncated raw JSONL to the judge.
 */

const RENDER_LIMIT = 15_000; // Max chars in rendered output

interface JsonlEvent {
  type: string;
  part?: {
    type?: string;
    text?: string;
    tool?: string;
    callID?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
    };
  };
}

/**
 * Render raw JSONL agent output into clean markdown.
 *
 * Produces a human-readable document with:
 *   - `## Assistant` sections for text events
 *   - `## Tool: <name>` sections for tool_use events with input/output blocks
 *   - Skips step_start/step_finish metadata events
 *
 * @param rawOutput  Full raw JSONL stdout from the agent run
 * @param limit      Max characters in the rendered output (default 15000)
 */
export function renderAgentOutput(rawOutput: string, limit: number = RENDER_LIMIT): string {
  const lines = rawOutput.split("\n").filter(l => l.trim().length > 0);
  const sections: string[] = [];

  for (const line of lines) {
    let event: JsonlEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (!event || typeof event !== "object" || !event.type) continue;

    if (
      event.type === "text" &&
      event.part?.type === "text" &&
      typeof event.part.text === "string"
    ) {
      const text = event.part.text.trim();
      if (text.length > 0) {
        sections.push(`## Assistant\n\n${text}`);
      }
    } else if (event.type === "tool_use" && event.part?.type === "tool") {
      const toolName = event.part.tool ?? "unknown";
      const callId = event.part.callID ?? "";
      const state = event.part.state;
      const status = state?.status ?? "unknown";

      let section = `## Tool: ${toolName}`;
      if (callId) section += ` (${callId})`;
      section += `\n**Status:** ${status}\n`;

      if (state?.input) {
        const inputStr = JSON.stringify(state.input, null, 2);
        section += `\n### Input\n\`\`\`json\n${truncate(inputStr, 500)}\n\`\`\`\n`;
      }

      if (state?.error) {
        section += `\n### Error\n\`\`\`\n${truncate(state.error, 500)}\n\`\`\`\n`;
      } else if (state?.output) {
        section += `\n### Output\n\`\`\`\n${truncate(state.output, 500)}\n\`\`\`\n`;
      }

      sections.push(section);
    }
    // Skip step_start, step_finish, error events
  }

  if (sections.length === 0) {
    // Fallback: if no structured events found, return raw text truncated
    return rawOutput.trim().slice(0, limit);
  }

  const rendered = sections.join("\n---\n\n");
  return rendered.length > limit ? rendered.slice(0, limit) + "\n\n(truncated)" : rendered;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n...(truncated)";
}
