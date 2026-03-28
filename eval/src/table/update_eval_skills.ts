import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { spawnSync } from "child_process";
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

const TRIGGER_RATE_DOMAINS = ["file-management", "file-management-skills"];
const TRIGGER_RATE_TASK_IDS = ["EVAL_FM_001", "EVAL_FM_002", "EVAL_FM_005", "EVAL_FM_010"];
const PINCHTAB_DOMAIN = "web-browsing-hard-pinchtab";
const GENERATE_PINCHTAB_CLI_USAGE_SHEET = false;

type TriggerRateDomainRow = {
  domain: string;
  checkedTasks: number;
  triggeredTasks: number;
  triggerRate: number;
  taskSkills: string[];
};

type PinchtabUsage = {
  tests: number;
  cliUsageToolCalls: number;
  curlUsageToolCalls: number;
};

function isPinchtabCliCommand(command: string) {
  const cmd = command.toLowerCase();
  return (
    cmd.includes("pinchtab ") ||
    cmd.includes("pinchtab/scripts/setup.ps1") ||
    cmd.includes("pinchtab/scripts/stop.ps1") ||
    cmd.includes("pinchtab\\scripts\\setup.ps1") ||
    cmd.includes("pinchtab\\scripts\\stop.ps1")
  );
}

function isCurlExeCommand(command: string) {
  return command.toLowerCase().includes("curl.exe");
}

async function analyzePinchtabAgentOutput(filePath: string) {
  const usage = {
    cliUsageToolCalls: 0,
    curlUsageToolCalls: 0,
  };

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        if (entry.type !== "tool_use") continue;
        if (entry.part?.tool !== "bash") continue;

        const command = entry.part?.state?.input?.command;
        if (typeof command !== "string") continue;

        if (isPinchtabCliCommand(command)) usage.cliUsageToolCalls += 1;
        if (isCurlExeCommand(command)) usage.curlUsageToolCalls += 1;
      } catch (e) {}
    }
  } finally {
    rl.close();
    stream.close();
  }

  return usage;
}

async function collectPinchtabUsage(modelPath: string): Promise<PinchtabUsage> {
  const domainPath = path.join(modelPath, PINCHTAB_DOMAIN);
  if (!fs.existsSync(domainPath)) {
    return {
      tests: 0,
      cliUsageToolCalls: 0,
      curlUsageToolCalls: 0,
    };
  }

  const usage: PinchtabUsage = {
    tests: 0,
    cliUsageToolCalls: 0,
    curlUsageToolCalls: 0,
  };

  const taskDirs = fs.readdirSync(domainPath).sort();
  for (const taskDir of taskDirs) {
    const taskPath = path.join(domainPath, taskDir);
    if (!fs.statSync(taskPath).isDirectory()) continue;

    const agentOutputPath = path.join(taskPath, "agent-output.jsonl");
    if (!fs.existsSync(agentOutputPath)) continue;

    usage.tests += 1;
    const taskUsage = await analyzePinchtabAgentOutput(agentOutputPath);
    usage.cliUsageToolCalls += taskUsage.cliUsageToolCalls;
    usage.curlUsageToolCalls += taskUsage.curlUsageToolCalls;
  }

  return usage;
}

async function generateXlsxReport() {
  const workbook = new ExcelJS.Workbook();
  const triggerRateByModel = new Map<string, Map<string, Map<string, string[]>>>();
  const pinchtabUsageByModel = new Map<string, PinchtabUsage>();

  for (const model of TARGET_MODELS) {
    const modelPath = path.join(EVAL_DIR, model);
    if (!fs.existsSync(modelPath)) continue;

    const modelDomainSkillMap = new Map<string, Map<string, string[]>>();
    triggerRateByModel.set(model, modelDomainSkillMap);
    if (GENERATE_PINCHTAB_CLI_USAGE_SHEET) {
      pinchtabUsageByModel.set(model, await collectPinchtabUsage(modelPath));
    }

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
      const taskSkillMap = new Map<string, string[]>();
      for (const result of summary.results) {
        taskSkillMap.set(result.id, result.skills || []);
        worksheet.addRow({
          domain: domain,
          id: result.id,
          name: result.name,
          skills: (result.skills || []).join(", "),
        });
      }

      modelDomainSkillMap.set(domain, taskSkillMap);
    }
  }

  const triggerSheet = workbook.addWorksheet("fm_skill_trigger_rate");
  triggerSheet.columns = [
    { header: "Model", key: "model", width: 44 },
    { header: "Domain", key: "domain", width: 24 },
    { header: "Checked Tasks", key: "checkedTasks", width: 14 },
    { header: "Triggered Tasks", key: "triggeredTasks", width: 16 },
    { header: "Trigger Rate (%)", key: "triggerRate", width: 16 },
    { header: "EVAL_FM_001", key: "task1", width: 18 },
    { header: "EVAL_FM_002", key: "task2", width: 18 },
    { header: "EVAL_FM_005", key: "task3", width: 18 },
    { header: "EVAL_FM_010", key: "task4", width: 18 },
  ];
  triggerSheet.getRow(1).font = { bold: true };

  for (const model of TARGET_MODELS) {
    const modelDomainSkillMap =
      triggerRateByModel.get(model) || new Map<string, Map<string, string[]>>();
    const domainRows: TriggerRateDomainRow[] = [];

    for (const domain of TRIGGER_RATE_DOMAINS) {
      const taskSkillMap = modelDomainSkillMap.get(domain) || new Map<string, string[]>();
      let triggeredTasks = 0;
      const taskSkills = TRIGGER_RATE_TASK_IDS.map(taskId => {
        const skills = taskSkillMap.get(taskId) || [];
        if (skills.length > 0) triggeredTasks += 1;
        return skills.length > 0 ? skills.join(", ") : "-";
      });

      const checkedTasks = TRIGGER_RATE_TASK_IDS.length;
      const triggerRate =
        checkedTasks > 0 ? Number(((triggeredTasks / checkedTasks) * 100).toFixed(2)) : 0;

      domainRows.push({
        domain,
        checkedTasks,
        triggeredTasks,
        triggerRate,
        taskSkills,
      });
    }

    for (const row of domainRows) {
      triggerSheet.addRow({
        model,
        domain: row.domain,
        checkedTasks: row.checkedTasks,
        triggeredTasks: row.triggeredTasks,
        triggerRate: row.triggerRate,
        task1: row.taskSkills[0],
        task2: row.taskSkills[1],
        task3: row.taskSkills[2],
        task4: row.taskSkills[3],
      });
    }
  }

  const triggerRateColumn = triggerSheet.getColumn("triggerRate");
  triggerRateColumn.numFmt = "0.00";

  if (GENERATE_PINCHTAB_CLI_USAGE_SHEET) {
    const pinchtabSheet = workbook.addWorksheet("pinchtab_cli_usage");
    pinchtabSheet.columns = [
      { header: "Model", key: "model", width: 44 },
      { header: "Pinchtab Tests", key: "tests", width: 16 },
      { header: "CLI Usage Tool Calls", key: "cliUsageToolCalls", width: 22 },
      { header: "curl.exe Usage Tool Calls", key: "curlUsageToolCalls", width: 26 },
    ];
    pinchtabSheet.getRow(1).font = { bold: true };

    for (const model of TARGET_MODELS) {
      const usage = pinchtabUsageByModel.get(model) || {
        tests: 0,
        cliUsageToolCalls: 0,
        curlUsageToolCalls: 0,
      };

      pinchtabSheet.addRow({
        model,
        tests: usage.tests,
        cliUsageToolCalls: usage.cliUsageToolCalls,
        curlUsageToolCalls: usage.curlUsageToolCalls,
      });
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, "model_skills_report.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(`XLSX report generated at: ${outputPath}`);
}

function formatSummariesWithPrettier(filePaths: string[]) {
  if (filePaths.length === 0) return;

  const prettierResult = spawnSync("bun", ["run", "format:files", "--", ...filePaths], {
    stdio: "inherit",
  });

  if (prettierResult.error || prettierResult.status !== 0) {
    console.warn("Prettier failed; summaries may be unformatted.");
  }
}

async function updateSkills() {
  const updatedSummaries: string[] = [];
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
      updatedSummaries.push(summaryPath);
      console.log(`Successfully updated ${summaryPath}`);
    }
  }

  formatSummariesWithPrettier(updatedSummaries);
  await generateXlsxReport();
}

updateSkills().catch(err => {
  console.error("Error during execution:", err);
  process.exit(1);
});
