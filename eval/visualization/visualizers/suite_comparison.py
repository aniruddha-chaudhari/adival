"""Suite comparison visualizations.

Compares the three web-browsing tool suites head-to-head:
  - web-browsing-hard-agent-browser (baseline, agent-only)
  - web-browsing-hard-pinchtab      (Pinchtab browser tool)
  - web-browsing-hard-playwright-mcp (Playwright MCP)

Produces 6 charts (16–21) and 4 table files (CSV + Markdown).
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from typing import Dict, List, Optional

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import seaborn as sns

from .utils import save_figure, format_model_name
import config

# ── Suite metadata ────────────────────────────────────────────────────────────
SUITE_ORDER = [
    "web-browsing-hard-agent-browser",
    "web-browsing-hard-pinchtab",
    "web-browsing-hard-playwright-mcp",
]

SUITE_LABELS = {
    "web-browsing-hard-agent-browser": "Agent Browser",
    "web-browsing-hard-pinchtab": "Pinchtab",
    "web-browsing-hard-playwright-mcp": "Playwright MCP",
}

# Consistent suite colours across every chart
SUITE_COLORS = {
    "web-browsing-hard-agent-browser": "#5B9BD5",  # blue
    "web-browsing-hard-pinchtab": "#ED7D31",  # orange
    "web-browsing-hard-playwright-mcp": "#70AD47",  # green
}

# Short model labels (provider/model → readable)
_MODEL_LABEL_MAP = {
    "github-copilot/claude-sonnet-4.6": "Sonnet 4.6",
    "github-copilot/claude-opus-4.6": "Opus 4.6",
    "github-copilot/gpt-5.3-codex": "GPT-5.3",
    "github-copilot/grok-code-fast-1": "Grok Fast",
    "github-copilot/gemini-3-flash-preview": "Gemini Flash",
    "opencode/minimax-m2.5-free": "MiniMax",
}

# Preferred display order of models
_MODEL_ORDER = [
    "github-copilot/gemini-3-flash-preview",
    "github-copilot/gpt-5.3-codex",
    "github-copilot/grok-code-fast-1",
    "github-copilot/claude-sonnet-4.6",
    "opencode/minimax-m2.5-free",
]

# Task ID display order (same across all suites)
TASK_ORDER = [
    "EVAL_ARXIV_001",
    "EVAL_CANIUSE_001",
    "EVAL_GH_002",
    "EVAL_GH_003",
    "EVAL_HN_001",
    "EVAL_MDN_001",
    "EVAL_NPM_001",
    "EVAL_PYPI_001",
    "EVAL_STACKOVERFLOW_002",
    "EVAL_WIKI_002",
]

TASK_SHORT = {
    "EVAL_ARXIV_001": "arXiv",
    "EVAL_CANIUSE_001": "CanIUse",
    "EVAL_GH_002": "GH-Contrib",
    "EVAL_GH_003": "GH-Issues",
    "EVAL_HN_001": "HN",
    "EVAL_MDN_001": "MDN",
    "EVAL_NPM_001": "npm",
    "EVAL_PYPI_001": "PyPI",
    "EVAL_STACKOVERFLOW_002": "StackOvfl",
    "EVAL_WIKI_002": "Wikipedia",
}


def _short_model(model: str) -> str:
    return _MODEL_LABEL_MAP.get(model, model.split("/")[-1])


def _suite_label(suite: str, labels: Dict[str, str]) -> str:
    return labels.get(suite, suite)


def _model_order_key(model: str) -> int:
    try:
        return _MODEL_ORDER.index(model)
    except ValueError:
        return 999


class SuiteComparisonVisualizer:
    """Head-to-head comparison of the three web-browsing-hard test suites."""

    # Only consider these three suites; filter everything else out.
    TARGET_SUITES = set(SUITE_ORDER)

    def __init__(
        self,
        aggregated_data: pd.DataFrame,
        task_results_by_model: Dict[str, List],
        suite_order: List[str] | None = None,
        suite_labels: Dict[str, str] | None = None,
        suite_colors: Dict[str, str] | None = None,
    ):
        """
        Args:
            aggregated_data: One row per (model, domain) — output of
                EvalResultsAggregator.aggregate_metrics().
            task_results_by_model: Raw task results keyed by "model::domain".
        """
        self.suite_order = suite_order or SUITE_ORDER
        self.suite_labels = suite_labels or SUITE_LABELS

        if suite_colors is None:
            colors = config.COLOR_PALETTE
            self.suite_colors = {
                s: colors[i % len(colors)] for i, s in enumerate(self.suite_order)
            }
        else:
            self.suite_colors = suite_colors

        self.target_suites = set(self.suite_order)

        # Filter to only the target suites
        mask = aggregated_data["domain"].isin(self.target_suites)
        self.agg = aggregated_data[mask].copy()

        self.raw: Dict[str, List] = {
            k: v
            for k, v in task_results_by_model.items()
            if "::" in k and k.split("::")[1] in self.target_suites
        }

        # Ordered unique model list (only those present in data)
        all_models = self.agg["model"].unique().tolist()
        self.models = sorted(
            [m for m in all_models if m not in {"github-copilot/claude-opus-4.6"}],
            key=_model_order_key,
        )

    # ── helpers ──────────────────────────────────────────────────────────────

    def _get_value(
        self, model: str, suite: str, col: str, default: Optional[float] = None
    ) -> Optional[float]:
        """Look up a scalar from aggregated_data; return default if missing."""
        row = self.agg[(self.agg["model"] == model) & (self.agg["domain"] == suite)]
        if row.empty or col not in row.columns:
            return default
        val = row[col].iloc[0]
        return float(val) if pd.notna(val) else default

    def _grouped_bar(
        self,
        metric_col: str,
        ylabel: str,
        title: str,
        chart_name: str,
        fmt_fn=None,
        ylim_top: Optional[float] = None,
        output_subdir: str | None = None,
    ):
        """Generic grouped-bar chart: x=models, 3 bars/model = 3 suites."""
        models = self.models
        suites = [s for s in self.suite_order if s in self.agg["domain"].values]
        n_models = len(models)
        n_suites = len(suites)

        if n_models == 0 or n_suites == 0:
            print(f"[SKIP] {chart_name}: no data")
            return

        bar_width = 0.7 / n_suites
        x = np.arange(n_models)

        fig_w = max(8, n_models * 1.6)
        fig, ax = plt.subplots(figsize=(fig_w, 5.5))

        for si, suite in enumerate(suites):
            values = []
            for model in models:
                v = self._get_value(model, suite, metric_col)
                values.append(v if v is not None else np.nan)

            offset = (si - (n_suites - 1) / 2) * bar_width
            bars = ax.bar(
                x + offset,
                values,
                width=bar_width * 0.92,
                label=_suite_label(suite, self.suite_labels),
                color=self.suite_colors[suite],
                alpha=0.88,
                edgecolor="black",
                linewidth=0.6,
            )

            # Value labels on bars
            for bar, val in zip(bars, values):
                if np.isnan(val):
                    continue
                label_str = fmt_fn(val) if fmt_fn else f"{val:.1f}"
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + (bar.get_height() * 0.02 + 0.3),
                    label_str,
                    ha="center",
                    va="bottom",
                    fontsize=6.5,
                    rotation=0,
                )

        ax.set_xticks(x)
        ax.set_xticklabels(
            [_short_model(m) for m in models],
            fontsize=config.FONT_SIZE_TICK,
            rotation=20,
            ha="right",
        )
        ax.set_ylabel(ylabel, fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(title, fontsize=config.FONT_SIZE_TITLE, pad=14)
        if ylim_top is not None:
            ax.set_ylim(0, ylim_top)
        else:
            ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.3)
        ax.legend(
            handles=[
                mpatches.Patch(
                    color=self.suite_colors[s],
                    label=_suite_label(s, self.suite_labels),
                    alpha=0.88,
                )
                for s in suites
            ],
            loc="upper right",
            frameon=False,
            fontsize=config.FONT_SIZE_LEGEND,
        )
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        save_figure(fig, chart_name, tight_layout=True, subdir=output_subdir)
        plt.close(fig)
        print(f"[+] {chart_name} created")

    # ── Chart 16 — Pass rate ─────────────────────────────────────────────────

    def plot_pass_rate(self, output_subdir: str | None = None):
        """Chart 16: Grouped bar — success rate (%) per model × suite."""
        self._grouped_bar(
            metric_col="success_rate",
            ylabel="Pass Rate (%)",
            title="Pass Rate by Model and Suite",
            chart_name="16_suite_pass_rate",
            fmt_fn=lambda v: f"{v:.0f}%",
            ylim_top=115,
            output_subdir=output_subdir,
        )

    # ── Chart 17 — Mean score ────────────────────────────────────────────────

    def plot_mean_score(self, output_subdir: str | None = None):
        """Chart 17: Grouped bar — mean score per model × suite."""
        self._grouped_bar(
            metric_col="mean_score",
            ylabel="Mean Score (0–100)",
            title="Mean Task Score by Model and Suite",
            chart_name="17_suite_mean_score",
            fmt_fn=lambda v: f"{v:.1f}",
            ylim_top=115,
            output_subdir=output_subdir,
        )

    # ── Chart 18 — Tool calls ────────────────────────────────────────────────

    def plot_tool_calls(self, output_subdir: str | None = None):
        """Chart 18: Grouped bar — mean tool calls per model × suite."""
        self._grouped_bar(
            metric_col="mean_tool_call_count",
            ylabel="Mean Tool Calls per Task",
            title="Mean Tool Calls by Model and Suite",
            chart_name="18_suite_tool_calls",
            fmt_fn=lambda v: f"{v:.1f}",
            output_subdir=output_subdir,
        )

    # ── Chart 19 — Elapsed time ──────────────────────────────────────────────

    def plot_elapsed_time(self, output_subdir: str | None = None):
        """Chart 19: Grouped bar — mean elapsed time (s) per model × suite."""
        self._grouped_bar(
            metric_col="mean_elapsed_sec_all",
            ylabel="Mean Elapsed Time (s)",
            title="Mean Elapsed Time by Model and Suite",
            chart_name="19_suite_elapsed_time",
            fmt_fn=lambda v: f"{v:.0f}s",
            output_subdir=output_subdir,
        )

    # ── Chart 20 — Total tokens ──────────────────────────────────────────────

    def plot_tokens(self, output_subdir: str | None = None):
        """Chart 20: Grouped bar — mean total tokens per model × suite."""

        def fmt_k(v):
            return f"{v / 1000:.0f}k"

        self._grouped_bar(
            metric_col="mean_total_tokens",
            ylabel="Mean Total Tokens per Task",
            title="Mean Total Tokens by Model and Suite",
            chart_name="20_suite_tokens",
            fmt_fn=fmt_k,
            output_subdir=output_subdir,
        )

    # ── Chart 21 — Per-task score heatmap ────────────────────────────────────

    def plot_task_heatmap(self, output_subdir: str | None = None):
        """Chart 21: Heatmap — rows=tasks, cols=model×suite, cell=score."""
        suites = [s for s in self.suite_order if s in self.agg["domain"].values]
        models = self.models

        # Build column list: "ModelShort\n(SuiteShort)"
        cols: List[str] = []
        col_keys: List[tuple] = []  # (model, suite)
        for suite in suites:
            for model in models:
                cols.append(
                    f"{_short_model(model)}\n({_suite_label(suite, self.suite_labels)})"
                )
                col_keys.append((model, suite))

        # Build score matrix  (tasks × cols)
        # Also build a "timeout" mask for annotation
        score_matrix = np.full((len(TASK_ORDER), len(cols)), np.nan)
        annot_matrix: List[List[str]] = [["" for _ in cols] for _ in TASK_ORDER]

        for ci, (model, suite) in enumerate(col_keys):
            key = f"{model}::{suite}"
            task_results = self.raw.get(key, [])
            task_map = {r["id"]: r for r in task_results}
            for ri, task_id in enumerate(TASK_ORDER):
                r = task_map.get(task_id)
                if r is None:
                    annot_matrix[ri][ci] = "—"
                    continue
                status = r.get("status", "")
                score = r.get("score")
                if status == "timeout":
                    score_matrix[ri][ci] = 0
                    annot_matrix[ri][ci] = "T/O"
                elif score is not None:
                    score_matrix[ri][ci] = float(score)
                    annot_matrix[ri][ci] = str(int(score))
                else:
                    annot_matrix[ri][ci] = "—"

        df_scores = pd.DataFrame(
            score_matrix,
            index=[TASK_SHORT.get(t, t) for t in TASK_ORDER],
            columns=cols,
        )

        n_rows = len(TASK_ORDER)
        n_cols = len(cols)
        fig_w = max(10, n_cols * 1.05)
        fig_h = max(5, n_rows * 0.55 + 1.5)

        fig, ax = plt.subplots(figsize=(fig_w, fig_h))

        # Custom grey for NaN
        cmap = sns.color_palette("RdYlGn", as_cmap=True).copy()
        cmap.set_bad(color="#d0d0d0")  # grey for NaN/missing

        sns.heatmap(
            df_scores,
            annot=annot_matrix,
            fmt="",
            cmap=cmap,
            vmin=0,
            vmax=100,
            ax=ax,
            linewidths=0.4,
            linecolor="white",
            cbar_kws={"label": "Score (0–100)", "shrink": 0.7},
            annot_kws={"size": 7},
        )

        ax.set_title(
            "Per-Task Score: All Models × All Suites",
            fontsize=config.FONT_SIZE_TITLE,
            pad=16,
        )
        ax.set_xlabel("Model  (Suite)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Task", fontsize=config.FONT_SIZE_LABEL)
        ax.set_xticklabels(
            ax.get_xticklabels(),
            rotation=35,
            ha="right",
            fontsize=6.5,
        )
        ax.set_yticklabels(
            ax.get_yticklabels(),
            rotation=0,
            fontsize=config.FONT_SIZE_TICK,
        )

        # Suite separator lines (vertical)
        n_models = len(models)
        for si in range(1, len(suites)):
            ax.axvline(si * n_models, color="black", linewidth=1.4, linestyle="--")

        # Legend: T/O = timeout, — = not run
        note = ax.text(
            0.01,
            -0.18,
            "T/O = timeout   |   — = not run   |   grey = no data",
            transform=ax.transAxes,
            fontsize=7,
            color="#444",
        )

        save_figure(
            fig, "21_suite_task_heatmap", tight_layout=True, subdir=output_subdir
        )
        plt.close(fig)
        print("[+] 21_suite_task_heatmap created")

    # ── Tables ───────────────────────────────────────────────────────────────

    def save_tables(self, data_subdir: str | None = None):
        """Save suite_summary_table and per_task_score_table as CSV + Markdown."""
        self._save_suite_summary_table(data_subdir=data_subdir)
        self._save_per_task_score_table(data_subdir=data_subdir)

    def _save_suite_summary_table(self, data_subdir: str | None = None):
        """Table 1: one row per (model, suite) with key aggregate metrics."""
        suites = [s for s in self.suite_order if s in self.agg["domain"].values]

        rows = []
        for suite in suites:
            for model in self.models:
                d = self.agg[
                    (self.agg["model"] == model) & (self.agg["domain"] == suite)
                ]
                if d.empty:
                    continue
                r = d.iloc[0]
                total = int(r.get("total_tasks", 0))
                passed = int(r.get("passed_tasks", 0))
                partial = int(r.get("partial_tasks", 0))
                failed = int(r.get("failed_tasks", 0))
                timeouts = total - passed - partial - failed  # residual

                rows.append(
                    {
                        "Model": _short_model(model),
                        "Suite": _suite_label(suite, self.suite_labels),
                        "Tasks": total,
                        "Pass": passed,
                        "Partial": partial,
                        "Fail/Timeout": failed,
                        "Pass Rate (%)": round(float(r.get("success_rate", 0)), 1),
                        "Mean Score": round(float(r.get("mean_score", 0)), 1),
                        "Mean Tokens": int(round(float(r.get("mean_total_tokens", 0)))),
                        "Mean Tool Calls": round(
                            float(r.get("mean_tool_call_count", 0)), 1
                        ),
                        "Mean Time (s)": round(
                            float(r.get("mean_elapsed_sec_all", 0)), 1
                        ),
                    }
                )

        df = pd.DataFrame(rows)
        if df.empty:
            print("[SKIP] suite_summary_table: no data")
            return

        csv_root = config.DATA_DIR
        if data_subdir:
            csv_root = csv_root / data_subdir
            csv_root.mkdir(parents=True, exist_ok=True)
        csv_path = csv_root / "suite_summary_table.csv"
        df.to_csv(csv_path, index=False)
        print(f"  [+] CSV saved: {csv_path}")

        md_path = csv_root / "suite_summary_table.md"
        md_path.write_text(_df_to_markdown(df), encoding="utf-8")
        print(f"  [+] Markdown saved: {md_path}")

    def _save_per_task_score_table(self, data_subdir: str | None = None):
        """Table 2: rows=tasks, cols=model×suite, cell=score (or T/O / —)."""
        suites = [s for s in self.suite_order if s in self.agg["domain"].values]
        col_headers = []
        col_keys = []
        for suite in suites:
            for model in self.models:
                col_headers.append(
                    f"{_short_model(model)} ({_suite_label(suite, self.suite_labels)})"
                )
                col_keys.append((model, suite))

        rows = []
        for task_id in TASK_ORDER:
            row: Dict = {"Task": TASK_SHORT.get(task_id, task_id)}
            for header, (model, suite) in zip(col_headers, col_keys):
                key = f"{model}::{suite}"
                task_results = self.raw.get(key, [])
                task_map = {r["id"]: r for r in task_results}
                r = task_map.get(task_id)
                if r is None:
                    row[header] = "—"
                else:
                    status = r.get("status", "")
                    score = r.get("score")
                    if status == "timeout":
                        row[header] = "T/O"
                    elif score is not None:
                        row[header] = int(score)
                    else:
                        row[header] = "—"
            rows.append(row)

        df = pd.DataFrame(rows)
        if df.empty:
            print("[SKIP] per_task_score_table: no data")
            return

        csv_root = config.DATA_DIR
        if data_subdir:
            csv_root = csv_root / data_subdir
            csv_root.mkdir(parents=True, exist_ok=True)
        csv_path = csv_root / "per_task_score_table.csv"
        df.to_csv(csv_path, index=False)
        print(f"  [+] CSV saved: {csv_path}")

        md_path = csv_root / "per_task_score_table.md"
        md_path.write_text(_df_to_markdown(df), encoding="utf-8")
        print(f"  [+] Markdown saved: {md_path}")

    # ── Run all ──────────────────────────────────────────────────────────────

    def plot_all(
        self, output_subdir: str | None = None, data_subdir: str | None = None
    ):
        """Generate all 6 charts and 2×2 table files."""
        print("\n[SUITE] Suite Comparison Charts")
        self.plot_pass_rate(output_subdir=output_subdir)
        self.plot_mean_score(output_subdir=output_subdir)
        self.plot_tool_calls(output_subdir=output_subdir)
        self.plot_elapsed_time(output_subdir=output_subdir)
        self.plot_tokens(output_subdir=output_subdir)
        self.plot_task_heatmap(output_subdir=output_subdir)
        print("\n[SUITE] Suite Comparison Tables")
        self.save_tables(data_subdir=data_subdir)


# ── Markdown helper ───────────────────────────────────────────────────────────


def _df_to_markdown(df: pd.DataFrame) -> str:
    """Convert DataFrame to a GitHub-flavoured markdown table."""
    lines = []
    header = "| " + " | ".join(str(c) for c in df.columns) + " |"
    sep = "| " + " | ".join("---" for _ in df.columns) + " |"
    lines.append(header)
    lines.append(sep)
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(str(v) for v in row.values) + " |")
    return "\n".join(lines) + "\n"
