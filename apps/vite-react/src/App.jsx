import "./App.css";
import { toPng, toSvg } from "html-to-image";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import evaluationSummaryCsv from "../../../eval/visualization/outputs/data/evaluation_summary.csv?raw";
import suiteSummaryCsv from "../../../eval/visualization/outputs/data/combined/Browsing/suite_summary_table.csv?raw";
import perTaskScoreCsv from "../../../eval/visualization/outputs/data/combined/Browsing/per_task_score_table.csv?raw";

const COLORS = ["#7c3aed", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6"];

const parseCsv = (csv) => {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");

  return lines.map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i - 1] !== "\\") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current);

    return headers.reduce((row, header, index) => {
      const value = values[index] ?? "";
      row[header] = Number.isNaN(Number(value)) || value === "" ? value : Number(value);
      return row;
    }, {});
  });
};

const formatModel = (model) =>
  model
    .replace("github-copilot/", "")
    .replace("opencode/", "")
    .replace("claude-sonnet-4.6", "Sonnet 4.6")
    .replace("gpt-5.3-codex", "GPT-5.3")
    .replace("grok-code-fast-1", "Grok Fast")
    .replace("gemini-3-flash-preview", "Gemini Flash")
    .replace("minimax-m2.5-free", "MiniMax");

const formatDomain = (domain) =>
  domain
    .replace("agent-browser", "Agent Browser")
    .replace("pinchtab", "Pinchtab")
    .replace("playwright-mcp", "Playwright MCP")
    .replace("file-management-skills", "File Mgmt Skills")
    .replace("file-management", "File Mgmt");

const formatNumber = (value, digits = 1) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const heatColor = (t) => {
  const hue = 120 * clamp01(t);
  return `hsl(${hue} 70% 88%)`;
};

const evaluationRows = parseCsv(evaluationSummaryCsv);
const suiteRows = parseCsv(suiteSummaryCsv);
const taskRows = parseCsv(perTaskScoreCsv);

const ALLOWED_MODELS = new Set([
  "github-copilot/claude-sonnet-4.6",
  "github-copilot/gemini-3-flash-preview",
  "github-copilot/gpt-5.3-codex",
  "github-copilot/grok-code-fast-1",
  "opencode/minimax-m2.5-free",
]);

const filteredEvaluationRows = evaluationRows.filter((row) => ALLOWED_MODELS.has(row.model));

const filteredSuiteRows = suiteRows.filter((row) => {
  const reverseMap = {
    "Sonnet 4.6": "github-copilot/claude-sonnet-4.6",
    "Gemini Flash": "github-copilot/gemini-3-flash-preview",
    "GPT-5.3": "github-copilot/gpt-5.3-codex",
    "Grok Fast": "github-copilot/grok-code-fast-1",
    MiniMax: "opencode/minimax-m2.5-free",
  };
  const canonical = reverseMap[row.Model] ?? row.Model;
  return ALLOWED_MODELS.has(canonical);
});

const modelPerformance = Object.values(
  filteredEvaluationRows.reduce((acc, row) => {
    const key = row.model;
    if (!acc[key]) {
      acc[key] = {
        model: formatModel(row.model),
        successRate: 0,
        meanScore: 0,
        meanTime: 0,
        meanTokens: 0,
        thrashRatio: 0,
        suites: 0,
      };
    }

    acc[key].successRate += row.success_rate;
    acc[key].meanScore += row.mean_score;
    acc[key].meanTime += row.mean_elapsed_sec_all;
    acc[key].meanTokens += row.mean_total_tokens;
    acc[key].thrashRatio += row.thrash_ratio;
    acc[key].suites += 1;
    return acc;
  }, {})
)
  .map((row) => ({
    ...row,
    successRate: row.successRate / row.suites,
    meanScore: row.meanScore / row.suites,
    meanTime: row.meanTime / row.suites,
    meanTokens: row.meanTokens / row.suites,
    thrashRatio: row.thrashRatio / row.suites,
  }))
  .sort((a, b) => b.successRate - a.successRate);

const domainPerformance = filteredEvaluationRows
  .map((row) => ({
    model: formatModel(row.model),
    domain: formatDomain(row.domain),
    successRate: row.success_rate,
    meanScore: row.mean_score,
    meanTokens: row.mean_total_tokens,
    meanTime: row.mean_elapsed_sec_all,
  }))
  .sort((a, b) => b.successRate - a.successRate);

const suitePerformance = filteredSuiteRows.map((row) => ({
  model: row.Model,
  suite: row.Suite,
  passRate: row["Pass Rate (%)"],
  meanScore: row["Mean Score"],
  meanTokens: row["Mean Tokens"],
  meanTime: row["Mean Time (s)"],
  meanToolCalls: row["Mean Tool Calls"],
}));

const suiteLabels = {
  "agent-browser": "Agent Browser",
  pinchtab: "Pinchtab",
  "playwright-mcp": "Playwright MCP",
};

const suiteComparisonSeries = (() => {
  const suites = ["agent-browser", "pinchtab", "playwright-mcp"];
  const modelOrder = ["Gemini Flash", "GPT-5.3", "Grok Fast", "Sonnet 4.6", "MiniMax"];
  const byModel = filteredSuiteRows.reduce((acc, row) => {
    acc[row.Model] ??= {};
    acc[row.Model][row.Suite] = row;
    return acc;
  }, {});

  return modelOrder
    .filter((model) => byModel[model])
    .map((model) => {
      const entry = { model };
      suites.forEach((suite) => {
        const row = byModel[model][suite];
        entry[`${suite}:passRate`] = row?.["Pass Rate (%)"] ?? 0;
        entry[`${suite}:meanScore`] = row?.["Mean Score"] ?? 0;
        entry[`${suite}:meanTokens`] = row?.["Mean Tokens"] ?? 0;
        entry[`${suite}:meanTime`] = row?.["Mean Time (s)"] ?? 0;
        entry[`${suite}:meanToolCalls`] = row?.["Mean Tool Calls"] ?? 0;
      });
      return entry;
    });
})();

const taskComparison = taskRows.map((row) => {
  const entry = { task: row.Task };
  Object.entries(row).forEach(([key, value]) => {
    if (key === "Task") return;
    entry[key] = value === "T/O" || value === "—" ? null : Number(value);
  });
  return entry;
});

const taskColumns = taskRows[0] ? Object.keys(taskRows[0]).slice(1, 6) : [];

const taskHeatColumns = taskRows[0] ? Object.keys(taskRows[0]).slice(1) : [];

const formatHeatmapHeader = (col) => {
  if (col === "Task") return col;
  const suiteShort = (suite) => {
    if (suite === "agent-browser") return "AB";
    if (suite === "pinchtab") return "PT";
    if (suite === "playwright-mcp") return "PW";
    return suite;
  };

  if (!col.includes("(")) {
    return col;
  }

  const [modelPart, suitePartRaw] = col.split(" (");
  const suite = suitePartRaw.replace(")", "");
  const modelShort = modelPart
    .replace("Gemini Flash", "GF")
    .replace("GPT-5.3", "G5.3")
    .replace("Grok Fast", "Grok")
    .replace("Sonnet 4.6", "S4.6")
    .replace("MiniMax", "MM");

  return `${modelShort} ${suiteShort(suite)}`;
};

const pythonChartParity = [
  {
    id: "01_success_rate_comparison",
    status: "Covered",
    note: "Stacked by domain + suite comparisons",
  },
  { id: "02a/b/c_token_efficiency", status: "Covered", note: "Bars from CSV means" },
  {
    id: "03_step_efficiency_distribution",
    status: "Approx",
    note: "CSV only has mean trajectory length (not per-task distribution)",
  },
  {
    id: "04_failure_analysis_breakdown",
    status: "Needs raw",
    note: "Requires per-task error categories from summary.json",
  },
  {
    id: "05_time_metrics_distribution",
    status: "Approx",
    note: "CSV has means; boxplot needs per-task elapsedMs",
  },
  { id: "06_model_comparison_heatmap", status: "Covered", note: "Normalized metrics heatmap table" },
  { id: "07_top_models_comparison", status: "Covered", note: "Top-N slice from heatmap" },
  { id: "08_domain_pass_rate_comparison", status: "Covered", note: "Domain/model pass-rate view" },
  { id: "09_domain_score_heatmap", status: "Covered", note: "Score heatmap by model/domain" },
  { id: "10_score_per_token", status: "Covered", note: "Mean score per 1k tokens" },
  { id: "11_speed_vs_score", status: "Covered", note: "Scatter from means" },
  { id: "12_thrash_vs_score", status: "Covered", note: "Scatter from means" },
  {
    id: "13_judge_keyword_concordance",
    status: "Needs raw",
    note: "Requires keywordScore + judgeScore per task",
  },
  { id: "14_per_task_score_breakdown", status: "Covered", note: "Per-task table + heatmap" },
  {
    id: "15_error_category_by_domain",
    status: "Needs raw",
    note: "Requires per-task error categories",
  },
  { id: "16-21_suite_comparison", status: "Covered", note: "Suite grouped bars + per-task heatmap" },
];

const scorePerToken = filteredEvaluationRows
  .filter((row) => Number(row.mean_total_tokens) > 0)
  .map((row) => ({
    label: `${formatModel(row.model)} / ${formatDomain(row.domain)}`,
    scorePer1k: row.mean_score / (row.mean_total_tokens / 1000),
  }))
  .sort((a, b) => b.scorePer1k - a.scorePer1k);

const tokenEfficiencyByDomain = filteredEvaluationRows
  .map((row) => ({
    key: `${formatModel(row.model)} / ${formatDomain(row.domain)}`,
    input: row.mean_input_tokens,
    output: row.mean_output_tokens,
    total: row.mean_total_tokens,
  }))
  .sort((a, b) => a.total - b.total);

const successRateStackedByDomain = (() => {
  const domains = [...new Set(filteredEvaluationRows.map((r) => r.domain))].sort();
  return domains.map((domain) => {
    const rows = filteredEvaluationRows.filter((r) => r.domain === domain);
    return {
      domain: formatDomain(domain),
      rows: rows
        .map((r) => ({
          model: formatModel(r.model),
          passed: r.success_rate,
          failed: 100 - r.success_rate,
        }))
        .sort((a, b) => a.passed - b.passed),
    };
  });
})();

function PanelNote({ title, children }) {
  return (
    <div className="panel-note">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

const dashboardKpis = [
  {
    label: "Best model avg pass rate",
    value: `${formatNumber(modelPerformance[0]?.successRate ?? 0)}%`,
    hint: modelPerformance[0]?.model ?? "No data",
  },
  {
    label: "Evaluation rows",
    value: filteredEvaluationRows.length,
    hint: "model/domain combinations",
  },
  {
    label: "Suite comparisons",
    value: suitePerformance.length,
    hint: "browser-suites table rows",
  },
  {
    label: "Tasks tracked",
    value: taskComparison.length,
    hint: "per-task score matrix rows",
  },
];

function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </div>
  );
}

const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

const safeFilePart = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function exportAllCharts(format) {
  const nodes = Array.from(document.querySelectorAll("[data-export-chart]"));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const node of nodes) {
    const title = node.getAttribute("data-export-title") || "chart";
    const base = safeFilePart(title) || "chart";
    const filename = `eval-${base}-${timestamp}.${format}`;

    try {
      const dataUrl =
        format === "svg"
          ? await toSvg(node, {
              cacheBust: true,
              backgroundColor: "#ffffff",
              pixelRatio: 2,
            })
          : await toPng(node, {
              cacheBust: true,
              backgroundColor: "#ffffff",
              pixelRatio: 2,
            });
      downloadDataUrl(dataUrl, filename);
      // Avoid triggering the browser's popup/download throttle.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 150));
    } catch (error) {
      // Best-effort export: skip failures and keep going.
      // eslint-disable-next-line no-console
      console.warn(`Failed to export ${title}`, error);
    }
  }
}

function App() {
  return (
    <main className="dashboard">
      <section className="hero">
        <div>
          <p className="eyebrow">Evaluation intelligence</p>
          <h1>Browser agent evaluation dashboard</h1>
          <p className="hero-copy">
            A cleaner, Recharts-powered view of the exported eval data with
            model, domain, suite, and task-level comparisons.
          </p>
        </div>
        <div className="hero-panel">
          <span>Data source</span>
          <strong>eval/visualization/outputs/data</strong>
          <p>Aggregated CSV outputs from the Python visualization pipeline.</p>
        </div>
      </section>

      <section className="export-strip" aria-label="Export charts">
        <div className="export-copy">
          <strong>Export</strong>
          <span>Downloads every chart panel below.</span>
        </div>
        <div className="export-actions">
          <button type="button" className="export-btn" onClick={() => exportAllCharts("png")}>
            Export all PNG
          </button>
          <button type="button" className="export-btn export-btn-secondary" onClick={() => exportAllCharts("svg")}>
            Export all SVG
          </button>
        </div>
      </section>

      <section className="kpi-grid">
        {dashboardKpis.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>

      <section className="chart-grid">
        <article className="panel panel-wide" data-export-chart data-export-title="Model ranking">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Performance overview</p>
              <h2>Model ranking</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={modelPerformance}
              margin={{ top: 10, right: 24, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="model"
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-15}
                height={60}
              />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value, name) => [formatNumber(value), name]} />
              <Legend />
              <Bar
                dataKey="successRate"
                name="Pass rate"
                fill="#7c3aed"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="meanScore"
                name="Mean score"
                fill="#06b6d4"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" data-export-chart data-export-title="Token share">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cost profile</p>
              <h2>Token share</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={modelPerformance.slice(0, 5)}
                dataKey="meanTokens"
                nameKey="model"
                innerRadius={72}
                outerRadius={118}
                paddingAngle={3}
              >
                {modelPerformance.slice(0, 5).map((entry, index) => (
                  <Cell key={entry.model} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${formatNumber(value)} tokens`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" data-export-chart data-export-title="Elapsed time vs score">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Speed vs quality</p>
              <h2>Elapsed time vs score</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid />
              <XAxis
                type="number"
                dataKey="meanTime"
                name="Time"
                tickFormatter={(value) => `${formatNumber(value, 0)}s`}
              />
              <YAxis type="number" dataKey="meanScore" name="Score" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) => [formatNumber(value), name]}
              />
              <Scatter data={modelPerformance} fill="#f59e0b" />
            </ScatterChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" data-export-chart data-export-title="Pass rate by suite">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Multi-suite trend</p>
              <h2>Pass rate by suite</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={suitePerformance} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="suite" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="passRate"
                name="Pass rate"
                stroke="#22c55e"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Python parity</p>
            <h2>Python visualizations in React</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chart</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {pythonChartParity.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.status}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PanelNote title="Why some need raw data">
          The CSV exports we’re using don’t include per-task judge scores or error categories.
          Those charts can be added if we read `eval/eval-results/**/summary.json` directly or export
          richer CSVs.
        </PanelNote>
      </section>

      <section className="chart-grid">
        <article className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">01</p>
              <h2>Success rate (stacked) per domain</h2>
            </div>
          </div>
          <div className="stack-grid">
            {successRateStackedByDomain.map((domain) => (
              <div
                key={domain.domain}
                className="stack-panel"
                data-export-chart
                data-export-title={`Success rate stacked - ${domain.domain}`}
              >
                <h3>{domain.domain}</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={domain.rows}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <YAxis type="category" dataKey="model" width={110} />
                    <Tooltip formatter={(value) => `${formatNumber(value)}%`} />
                    <Legend />
                    <Bar
                      dataKey="passed"
                      name="Passed"
                      stackId="a"
                      fill="#22c55e"
                      radius={[8, 0, 0, 8]}
                    />
                    <Bar
                      dataKey="failed"
                      name="Failed/Partial"
                      stackId="a"
                      fill="#cbd5e1"
                      radius={[0, 8, 8, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </article>

        <article className="panel" data-export-chart data-export-title="Token efficiency">
          <div className="panel-header">
            <div>
              <p className="eyebrow">02</p>
              <h2>Token efficiency</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={tokenEfficiencyByDomain.slice(-12)}
              margin={{ top: 10, right: 18, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="key" tick={{ fontSize: 10 }} interval={0} angle={-18} height={80} />
              <YAxis tickFormatter={(v) => `${formatNumber(v / 1000, 0)}k`} />
              <Tooltip formatter={(v) => formatNumber(v, 0)} />
              <Legend />
              <Bar dataKey="input" name="Input" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              <Bar dataKey="output" name="Output" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              <Bar dataKey="total" name="Total" fill="#94a3b8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" data-export-chart data-export-title="Step efficiency mean">
          <div className="panel-header">
            <div>
              <p className="eyebrow">03</p>
              <h2>Step efficiency (mean)</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={filteredEvaluationRows
                .map((r) => ({
                  label: `${formatModel(r.model)} / ${formatDomain(r.domain)}`,
                  steps: r.mean_trajectory_length,
                }))
                .sort((a, b) => a.steps - b.steps)}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="steps" name="Mean steps" fill="#06b6d4" radius={[8, 8, 8, 8]}>
                <LabelList dataKey="steps" position="right" formatter={(v) => formatNumber(v, 1)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" data-export-chart data-export-title="Score per 1k tokens">
          <div className="panel-header">
            <div>
              <p className="eyebrow">10</p>
              <h2>Score per 1k tokens</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={scorePerToken.slice(0, 12).reverse()}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatNumber(v, 2)} />
              <Bar dataKey="scorePer1k" name="Score / 1k tokens" fill="#7c3aed" radius={[8, 8, 8, 8]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">16–20</p>
            <h2>Suite comparison (grouped bars)</h2>
          </div>
        </div>
        <div className="suite-grid">
          {[
            { key: "passRate", title: "Pass rate (%)", suffix: "%" },
            { key: "meanScore", title: "Mean score", suffix: "" },
            { key: "meanTokens", title: "Mean tokens", suffix: "" },
            { key: "meanTime", title: "Mean time (s)", suffix: "s" },
            { key: "meanToolCalls", title: "Mean tool calls", suffix: "" },
          ].map((metric) => (
            <div
              key={metric.key}
              className="suite-panel"
              data-export-chart
              data-export-title={`Suite comparison - ${metric.title}`}
            >
              <h3>{metric.title}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={suiteComparisonSeries} margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) =>
                      metric.key === "meanTokens"
                        ? `${formatNumber(v / 1000, 0)}k`
                        : `${formatNumber(v, 0)}${metric.suffix}`
                    }
                  />
                  <Tooltip formatter={(v) => (metric.key === "meanTokens" ? formatNumber(v, 0) : formatNumber(v, 1))} />
                  <Legend />
                  <Bar dataKey={`agent-browser:${metric.key}`} name={suiteLabels["agent-browser"]} fill="#5B9BD5" radius={[6, 6, 0, 0]} />
                  <Bar dataKey={`pinchtab:${metric.key}`} name={suiteLabels.pinchtab} fill="#ED7D31" radius={[6, 6, 0, 0]} />
                  <Bar dataKey={`playwright-mcp:${metric.key}`} name={suiteLabels["playwright-mcp"]} fill="#70AD47" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" data-export-chart data-export-title="Per-task score heatmap">
        <div className="panel-header">
          <div>
            <p className="eyebrow">21</p>
            <h2>Per-task score heatmap (all suites)</h2>
          </div>
        </div>
        <div className="heatmap-frame">
          <div className="heatmap-scroll">
            <table className="heatmap-table heatmap-wide">
            <thead>
              <tr>
                <th>Task</th>
                {taskHeatColumns.map((col) => (
                  <th key={col} className="heatmap-col-header">
                    <span>{formatHeatmapHeader(col)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskComparison.map((row) => (
                <tr key={row.task}>
                  <td>{row.task}</td>
                  {taskHeatColumns.map((col) => {
                    const val = row[col];
                    const t = val == null ? null : clamp01(val / 100);
                    return (
                      <td
                        key={col}
                        className="heatmap-cell"
                        style={{
                          background:
                            val == null ? "rgba(148,163,184,0.20)" : heatColor(t),
                        }}
                        title={val == null ? "No data / timeout" : `Score: ${val}`}
                      >
                        <span className="heatmap-value">{val == null ? "" : val}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="table-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Top models</p>
              <h2>Fastest & strongest performers</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Pass rate</th>
                  <th>Score</th>
                  <th>Tokens</th>
                  <th>Thrash</th>
                </tr>
              </thead>
              <tbody>
                {modelPerformance.slice(0, 5).map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td>{formatNumber(row.successRate)}%</td>
                    <td>{formatNumber(row.meanScore)}</td>
                    <td>{formatNumber(row.meanTokens, 0)}</td>
                    <td>{formatNumber(row.thrashRatio, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Per-task matrix</p>
              <h2>Task comparison snapshot</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  {taskColumns.map((key) => (
                    <th key={key}>{key.replace(/ \(.+\)/, "")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taskComparison.slice(0, 6).map((row) => (
                  <tr key={row.task}>
                    <td>{row.task}</td>
                    {taskColumns
                      .map((key) => (
                        <td key={key}>{row[key] ?? "—"}</td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel data-strip">
        <div>
          <p className="eyebrow">Domain highlights</p>
          <h2>Best model/domain combinations</h2>
        </div>
        <div className="domain-list">
          {domainPerformance.slice(0, 6).map((row) => (
            <div key={`${row.model}-${row.domain}`} className="domain-pill">
              <strong>{row.model}</strong>
              <span>{row.domain}</span>
              <small>{formatNumber(row.successRate)}% pass</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
