import fs from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";

type SummaryFile = {
  runAt?: string;
  model?: string;
  domain?: string;
  runDir?: string;
  results?: Array<Record<string, unknown>>;
};

type DomainBlock = {
  domain: string;
  runAt: string;
  model: string;
  runDir: string;
  results: Array<Record<string, unknown>>;
};

const DEFAULT_ROOT = path.join("eval", "eval-results");
const DEFAULT_OUT = path.join("eval", "visualization", "outputs", "data", "eval-results.xlsx");

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const flattenObject = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      Object.assign(out, flattenObject(value, nextKey));
    } else if (Array.isArray(value)) {
      out[nextKey] = JSON.stringify(value);
    } else {
      out[nextKey] = value;
    }
  }
  return out;
};

const listSummaryFiles = async (rootDir: string): Promise<string[]> => {
  const results: string[] = [];
  const queue: string[] = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "others") continue;
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === "summary.json") {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
};

const getModelFromPath = (summaryPath: string): string => {
  const parts = summaryPath.split(path.sep);
  const idx = parts.findIndex((part) => part === "eval-results");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "unknown-model";
};

const ensureDir = async (filePath: string): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const normalizeSheetName = (name: string): string => {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, "_");
  return cleaned.length <= 31 ? cleaned : cleaned.slice(0, 31);
};

const toCellValue = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
};

const buildWorkbook = async (rootDir: string, outFile: string): Promise<void> => {
  const summaryFiles = await listSummaryFiles(rootDir);
  const byModel: Map<string, DomainBlock[]> = new Map();

  for (const filePath of summaryFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as SummaryFile;
    const modelFolder = getModelFromPath(filePath);
    const domain = parsed.domain || path.basename(path.dirname(filePath));
    const block: DomainBlock = {
      domain,
      runAt: parsed.runAt || "",
      model: parsed.model || modelFolder,
      runDir: parsed.runDir || "",
      results: parsed.results || [],
    };
    if (!byModel.has(modelFolder)) byModel.set(modelFolder, []);
    byModel.get(modelFolder)?.push(block);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "adival";
  workbook.created = new Date();

  for (const [modelFolder, domainBlocks] of Array.from(byModel.entries()).sort()) {
    const sheet = workbook.addWorksheet(normalizeSheetName(modelFolder));
    const columnWidths: number[] = [];
    const allKeys = new Set<string>();

    for (const block of domainBlocks) {
      for (const result of block.results) {
        const flat = flattenObject(result);
        Object.keys(flat).forEach((key) => allKeys.add(key));
      }
    }

    const orderedKeys = Array.from(allKeys).sort();
    const header = ["runAt", "summaryModel", "summaryDomain", "runDir", ...orderedKeys];

    let firstDomain = true;
    for (const block of domainBlocks) {
      if (!firstDomain) {
        sheet.addRow([]);
        sheet.addRow([]);
      }
      firstDomain = false;

      const domainRow = sheet.addRow([`Domain: ${block.domain}`]);
      domainRow.font = { name: "Arial", bold: true };
      sheet.addRow(header).font = { name: "Arial", bold: true };

      for (const result of block.results) {
        const flat = flattenObject(result);
        const rowValues = [
          block.runAt,
          block.model,
          block.domain,
          block.runDir,
          ...orderedKeys.map((key) => toCellValue(flat[key])),
        ];
        const row = sheet.addRow(rowValues);
        row.font = { name: "Arial" };
      }
    }

    for (let colIndex = 1; colIndex <= header.length; colIndex += 1) {
      const col = sheet.getColumn(colIndex);
      let maxLen = 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value;
        const str = val === null || val === undefined ? "" : String(val);
        maxLen = Math.max(maxLen, Math.min(str.length + 2, 60));
      });
      columnWidths[colIndex - 1] = maxLen;
    }

    sheet.columns = sheet.columns?.map((col, idx) => ({ ...col, width: columnWidths[idx] })) || [];
  }

  await ensureDir(outFile);
  await workbook.xlsx.writeFile(outFile);
};

const main = async () => {
  const args = process.argv.slice(2);
  const rootArgIndex = args.indexOf("--root");
  const outArgIndex = args.indexOf("--out");
  const rootDir = rootArgIndex >= 0 ? args[rootArgIndex + 1] : DEFAULT_ROOT;
  const outFile = outArgIndex >= 0 ? args[outArgIndex + 1] : DEFAULT_OUT;
  if (!rootDir || !outFile) {
    throw new Error("Usage: bun run manager/tools/build_eval_results_excel.ts --root <path> --out <path>");
  }
  await buildWorkbook(rootDir, outFile);
  console.log(`Wrote ${outFile}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
