import { tool } from "@opencode-ai/plugin";
import { readFileSync } from "fs";
import { resolve } from "path";

export default tool({
  description:
    "Read and parse the YAML front matter from a markdown chat file. Returns the front matter fields as a JSON object, or an error if no front matter is found.",
  args: {
    file_path: tool.schema
      .string()
      .describe("Path to the markdown file, relative to the project root"),
  },
  async execute(args, context) {
    const abs = resolve(context.worktree, args.file_path);
    const content = readFileSync(abs, "utf8");

    // Front matter is the block between the first and second --- markers.
    // The opening --- must be on the very first line.
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      return JSON.stringify({ error: "No front matter found", file: args.file_path });
    }

    const yaml = match[1];

    // Minimal YAML parser: handles strings, arrays of strings, and bare values.
    const result: Record<string, unknown> = {};

    // Split into lines and process state machine for block scalars / arrays.
    const lines = yaml.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Skip blank lines at top level.
      if (!line.trim()) {
        i++;
        continue;
      }

      // Key: value  OR  key: "quoted"  OR  key: |  (block scalar, ignored)
      const keyVal = line.match(/^(\w[\w-]*):\s*(.*)/);
      if (!keyVal) {
        i++;
        continue;
      }

      const key = keyVal[1];
      const rest = keyVal[2].trim();

      // Inline quoted string
      if (/^".*"$/.test(rest)) {
        result[key] = rest.slice(1, -1).replace(/\\"/g, '"');
        i++;
        continue;
      }

      // Block sequence (value is empty, next lines start with "  - ")
      if (rest === "" || rest === "|" || rest === ">") {
        const items: string[] = [];
        i++;
        while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
          const item = lines[i]
            .replace(/^\s+-\s+/, "")
            .replace(/^"|"$/g, "")
            .trim();
          items.push(item);
          i++;
        }
        result[key] = items.length > 0 ? items : rest || "";
        continue;
      }

      // Inline sequence  key: [a, b, c]
      if (rest.startsWith("[")) {
        const inner = rest.replace(/^\[|\]$/g, "");
        result[key] = inner ? inner.split(",").map(s => s.trim().replace(/^"|"$/g, "")) : [];
        i++;
        continue;
      }

      // Plain scalar
      result[key] = rest;
      i++;
    }

    return JSON.stringify(result, null, 2);
  },
});
