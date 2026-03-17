import * as fs from "fs";
import * as path from "path";

const EVAL_DIR = path.resolve(__dirname, "../../eval-results");

const TARGET_MODELS = [
  "github-copilot_claude-sonnet-4.6",
  "github-copilot_gemini-3-flash-preview",
  "github-copilot_gpt-5.3-codex",
  "github-copilot_grok-code-fast-1",
  "opencode_minimax-m2.5-free",
];

async function updateSkills() {
  for (const model of TARGET_MODELS) {
    const modelPath = path.join(EVAL_DIR, model);
    if (!fs.existsSync(modelPath)) {
      console.warn(`Model path not found: ${modelPath}`);
      continue;
    }

    const domains = fs.readdirSync(modelPath);
    for (const domain of domains) {
      const domainPath = path.join(modelPath, domain);
      if (!fs.statSync(domainPath).isDirectory()) continue;

      const summaryPath = path.join(domainPath, "summary.json");
      if (!fs.existsSync(summaryPath)) continue;

      console.log(`Processing summary: ${summaryPath}`);
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

      for (const result of summary.results) {
        // Find the task directory that starts with the result ID
        const taskDir = fs
          .readdirSync(domainPath)
          .find(
            d => d.startsWith(result.id) && fs.statSync(path.join(domainPath, d)).isDirectory()
          );

        if (!taskDir) {
          result.skills = [];
          continue;
        }

        const agentOutputPath = path.join(domainPath, taskDir, "agent-output.jsonl");
        const uniqueSkills = new Set<string>();

        if (fs.existsSync(agentOutputPath)) {
          const lines = fs.readFileSync(agentOutputPath, "utf8").split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              // Looking for tool_use entries where tool is 'skill'
              // Based on the observed structure: {"type":"tool_use","part":{"tool":"skill","state":{"status":"completed","input":{"name":"..."}}}}
              if (entry.type === "tool_use" && entry.part?.tool === "skill") {
                const skillName = entry.part.state?.input?.name;
                if (skillName) uniqueSkills.add(skillName);
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
        }

        result.skills = Array.from(uniqueSkills).sort();
      }

      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      console.log(`Successfully updated ${summaryPath}`);
    }
  }
}

updateSkills().catch(err => {
  console.error("Error during execution:", err);
  process.exit(1);
});
