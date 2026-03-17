import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";

const EVAL_DIR = path.resolve(__dirname, "../../eval-results");
const OUTPUT_DIR = path.resolve(__dirname, "../../visualization/outputs/data");

const TARGET_MODELS = [
  "github-copilot_claude-sonnet-4.6",
  "github-copilot_gemini-3-flash-preview",
  "github-copilot_gpt-5.3-codex",
  "github-copilot_grok-code-fast-1",
  "opencode_minimax-m2.5-free",
];

async function generateXlsxReport() {
  const workbook = new ExcelJS.Workbook();

  for (const model of TARGET_MODELS) {
    const modelPath = path.join(EVAL_DIR, model);
    if (!fs.existsSync(modelPath)) continue;

    const sheetName = model.split("_").pop()?.substring(0, 31) || model;
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: "Domain", key: "domain", width: 25 },
      { header: "Task ID", key: "id", width: 15 },
      { header: "Task Name", key: "name", width: 60 },
      { header: "Skills Used", key: "skills", width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };

    const domains = fs.readdirSync(modelPath).sort();
    let isFirstDomain = true;
    for (const domain of domains) {
      const domainPath = path.join(modelPath, domain);
      if (!fs.statSync(domainPath).isDirectory()) continue;

      const summaryPath = path.join(domainPath, "summary.json");
      if (!fs.existsSync(summaryPath)) continue;

      if (!isFirstDomain) {
        worksheet.addRow([]);
        worksheet.addRow([]);
      }
      isFirstDomain = false;

      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      for (const result of summary.results) {
        worksheet.addRow({
          domain: domain,
          id: result.id,
          name: result.name,
          skills: (result.skills || []).join(", "),
        });
      }
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, "model_skills_report.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(`XLSX report generated at: ${outputPath}`);
}

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
        const taskDir = fs
          .readdirSync(domainPath)
          .find(
            d => d.startsWith(result.id) && fs.statSync(path.join(domainPath, d)).isDirectory()
          );

        if (!taskDir) {
          result.skills = result.skills || [];
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
              if (entry.type === "tool_use" && entry.part?.tool === "skill") {
                const skillName = entry.part.state?.input?.name;
                if (skillName) uniqueSkills.add(skillName);
              }
            } catch (e) {}
          }
        }

        result.skills = Array.from(uniqueSkills).sort();
      }

      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      console.log(`Successfully updated ${summaryPath}`);
    }
  }

  await generateXlsxReport();
}

updateSkills().catch(err => {
  console.error("Error during execution:", err);
  process.exit(1);
});
