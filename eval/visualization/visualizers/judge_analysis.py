"""Judge analysis visualization"""

import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict
from typing import Dict, List
from .utils import save_figure, get_color_palette, format_model_name
import config


class JudgeAnalysisVisualizer:
    """Visualize judge score analysis and concordance"""

    def __init__(self, task_results_by_model: Dict[str, List[dict]]):
        """
        Args:
            task_results_by_model: Dict keyed by "model::domain", values are
                                   lists of per-task result dicts.
        """
        self.task_results_by_model = task_results_by_model

    def plot_keyword_vs_judge_concordance(self):
        """
        Scatter plot of keywordScore vs judgeScore across all tasks/runs.
        Only includes tasks where judgeScore is not None.
        Points colored by model name.
        """
        # Collect data points
        points = []  # (keyword_score, judge_score, model_name)
        for key, tasks in self.task_results_by_model.items():
            model, _domain = key.split("::", 1)
            for task in tasks:
                judge_score = task.get("judgeScore")
                if judge_score is None:
                    continue
                keyword_score = task.get("keywordScore", 0)
                points.append((keyword_score, judge_score, model))

        if len(points) < 3:
            print(
                "[SKIP] Judge/keyword concordance: fewer than 3 tasks have a judgeScore"
            )
            return

        # Gather unique models and assign colors
        unique_models = list(dict.fromkeys(p[2] for p in points))
        palette = get_color_palette(len(unique_models))
        model_color = {m: palette[i] for i, m in enumerate(unique_models)}

        fig, ax = plt.subplots(
            figsize=(config.FIGURE_WIDTH_DOUBLE, config.FIGURE_HEIGHT_DOUBLE)
        )

        # Plot points per model
        for model in unique_models:
            xs = [p[0] for p in points if p[2] == model]
            ys = [p[1] for p in points if p[2] == model]
            ax.scatter(
                xs,
                ys,
                color=model_color[model],
                alpha=0.6,
                s=40,
                label=format_model_name(model),
            )

        # y = x reference line
        ax.plot(
            [0, 100],
            [0, 100],
            linestyle="--",
            color="gray",
            alpha=0.5,
            linewidth=config.EDGE_WIDTH,
            label="Perfect concordance",
        )

        ax.set_xlim(0, 100)
        ax.set_ylim(0, 100)
        ax.set_xlabel("Keyword Score", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Judge Score", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Keyword Score vs Judge Score Concordance",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.tick_params(labelsize=config.FONT_SIZE_TICK)

        if len(unique_models) <= 10:
            ax.legend(loc="upper left", frameon=False, fontsize=config.FONT_SIZE_LEGEND)

        save_figure(fig, "13_judge_keyword_concordance", tight_layout=True)
        plt.close(fig)

        print(f"[+] Judge/keyword concordance created ({len(points)} tasks)")

    def plot_per_task_scores(self):
        """
        Grouped bar chart showing score per task ID, one bar per model::domain run.
        """
        keys = list(self.task_results_by_model.keys())
        if len(keys) < 2:
            print("[SKIP] Per-task score breakdown: fewer than 2 (model, domain) runs")
            return

        # Collect all unique task IDs (sorted)
        all_task_ids = sorted(
            {
                task["id"]
                for tasks in self.task_results_by_model.values()
                for task in tasks
            }
        )
        n_tasks = len(all_task_ids)
        n_keys = len(keys)

        # Build score lookup: key -> task_id -> score
        score_lookup: Dict[str, Dict[str, float]] = {}
        for key, tasks in self.task_results_by_model.items():
            score_lookup[key] = {task["id"]: task.get("score", 0) for task in tasks}

        palette = get_color_palette(n_keys)
        key_color = {k: palette[i] for i, k in enumerate(keys)}

        width_fig = max(8, n_tasks * 0.8)
        fig, ax = plt.subplots(figsize=(width_fig, 5))

        bar_width = 0.8 / n_keys
        x = np.arange(n_tasks)

        for i, key in enumerate(keys):
            scores = [score_lookup[key].get(tid, 0) for tid in all_task_ids]
            offset = (i - (n_keys - 1) / 2) * bar_width
            ax.bar(
                x + offset,
                scores,
                width=bar_width,
                color=key_color[key],
                label=key,
                alpha=0.85,
                edgecolor="black",
                linewidth=config.EDGE_WIDTH,
            )

        ax.set_xticks(x)
        ax.set_xticklabels(
            all_task_ids, rotation=45, ha="right", fontsize=config.FONT_SIZE_TICK
        )
        ax.set_ylabel("Score (0-100)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Per-Task Score Breakdown by Model/Domain",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.tick_params(axis="y", labelsize=config.FONT_SIZE_TICK)
        ax.set_ylim(0, 105)
        ax.legend(frameon=False, fontsize=config.FONT_SIZE_LEGEND)
        ax.grid(axis="y", alpha=0.3)

        save_figure(fig, "14_per_task_score_breakdown", tight_layout=True)
        plt.close(fig)

        print(f"[+] Per-task score breakdown created ({n_tasks} tasks)")

    def plot_error_category_by_domain(self):
        """
        Stacked horizontal bar chart of error categories per domain,
        aggregated across all models.
        """
        error_categories = [
            "none",
            "comprehension",
            "execution",
            "resource",
            "navigation",
        ]
        category_colors = {
            "none": "#2ecc71",
            "comprehension": "#e74c3c",
            "execution": "#f39c12",
            "resource": "#e67e22",
            "navigation": "#9b59b6",
        }

        # Aggregate counts: domain -> category -> count
        domain_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for key, tasks in self.task_results_by_model.items():
            _model, domain = key.split("::", 1)
            for task in tasks:
                analysis = task.get("analysis")
                if analysis and isinstance(analysis, dict):
                    error_info = analysis.get("error")
                    if error_info and isinstance(error_info, dict):
                        category = error_info.get("category", "none")
                    else:
                        category = "none"
                else:
                    category = "none"
                # Normalize to known categories
                if category not in error_categories:
                    category = "none"
                domain_counts[domain][category] += 1

        domains = sorted(domain_counts.keys())

        # Skip if only one domain and it's "unknown"
        if len(domains) == 1 and domains[0] == "unknown":
            print(
                "[SKIP] Error category by domain: all tasks belong to the single domain 'unknown'"
            )
            return

        n_domains = len(domains)
        fig, ax = plt.subplots(
            figsize=(config.FIGURE_WIDTH_DOUBLE, max(4, n_domains * 0.6 + 1))
        )

        y_pos = np.arange(n_domains)
        left = np.zeros(n_domains)

        for cat in error_categories:
            values = np.array(
                [domain_counts[d].get(cat, 0) for d in domains], dtype=float
            )
            ax.barh(
                y_pos,
                values,
                left=left,
                label=cat.capitalize(),
                color=category_colors[cat],
                alpha=0.85,
                edgecolor="black",
                linewidth=config.EDGE_WIDTH,
            )
            left += values

        ax.set_yticks(y_pos)
        ax.set_yticklabels(domains, fontsize=config.FONT_SIZE_TICK)
        ax.set_xlabel("Count", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Error Categories by Domain (All Models)",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.tick_params(axis="x", labelsize=config.FONT_SIZE_TICK)
        ax.legend(loc="lower right", frameon=False, fontsize=config.FONT_SIZE_LEGEND)
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "15_error_category_by_domain", tight_layout=True)
        plt.close(fig)

        print(f"[+] Error category by domain created ({n_domains} domains)")
