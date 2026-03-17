"""Time-to-success visualization with median, IQR, and success-conditioned metrics"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from typing import Dict
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
    compute_ci_median_iqr,
)
import config


class TimeMetricsVisualizer:
    """Visualize time-to-success metrics with median/IQR and success-conditioned speed"""

    def __init__(self, task_results_by_model: Dict[str, list]):
        """
        Args:
            task_results_by_model: Dict mapping model name to list of task results
        """
        self.task_results = task_results_by_model

    def _plot_for_suite(self, suite: str, top_n: int | None = None):
        """Create box plot of elapsed time distribution for a single suite."""
        suite_key_suffix = f"::{suite}"

        time_data = {}
        passed_time_data = {}
        for key, tasks in self.task_results.items():
            if not key.endswith(suite_key_suffix):
                continue
            model = key.split("::", 1)[0]
            all_times = []
            passed_times = []
            for task in tasks:
                elapsed_ms = task.get("elapsedMs", 0)
                elapsed_sec = elapsed_ms / 1000  # Convert to seconds
                all_times.append(elapsed_sec)
                if task.get("status") == "pass":
                    passed_times.append(elapsed_sec)
            if all_times:
                time_data[model] = all_times
                passed_time_data[model] = passed_times

        if not time_data:
            print(
                f"[SKIP] Time metrics visualization: No elapsed time data for suite={suite}"
            )
            return

        median_times = {m: np.median(l) for m, l in time_data.items()}
        sorted_models = sorted(median_times.keys(), key=lambda x: median_times[x])

        if top_n and len(sorted_models) > top_n:
            sorted_models = sorted_models[-top_n:]

        data_to_plot = [time_data[m] for m in sorted_models]
        n_models = len(sorted_models)
        width, height = set_figure_width_by_model_count(n_models, base_height=5.5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        bp = ax.boxplot(
            data_to_plot,
            labels=[format_model_name(m) for m in sorted_models],
            patch_artist=True,
            vert=False,
            widths=0.6,
        )

        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.85)
            patch.set_edgecolor("black")
            patch.set_linewidth(config.EDGE_WIDTH)

        for whisker in bp["whiskers"]:
            whisker.set_linewidth(config.EDGE_WIDTH)
            whisker.set_color("black")
        for cap in bp["caps"]:
            cap.set_linewidth(config.EDGE_WIDTH)
            cap.set_color("black")
        for median in bp["medians"]:
            median.set_linewidth(2)
            median.set_color("darkred")

        for flier in bp["fliers"]:
            flier.set(marker="o", markerfacecolor="gray", markersize=4, alpha=0.5)

        for i, model in enumerate(sorted_models):
            passed_times = passed_time_data.get(model, [])
            if passed_times:
                mean_passed = np.mean(passed_times)
                ax.scatter(
                    mean_passed,
                    i + 1,
                    marker="D",
                    color="navy",
                    s=40,
                    zorder=5,
                    label="Mean (passed)" if i == 0 else None,
                )

            arr = np.array(time_data[model])
            _median_val, q25, q75 = compute_ci_median_iqr(arr)
            iqr = q75 - q25
            ax.annotate(
                f"IQR={iqr:.1f}s",
                xy=(q75, i + 1),
                xytext=(5, 0),
                textcoords="offset points",
                fontsize=config.FONT_SIZE_TICK - 1,
                va="center",
                color="gray",
            )

        ax.set_xlabel("Wall-Clock Time (seconds)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            f"Time-to-Success Distribution – {suite}",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.grid(axis="x", alpha=0.3)
        ax.legend(
            loc="upper right",
            fontsize=config.FONT_SIZE_LEGEND,
        )

        save_figure(
            fig,
            "05_time_metrics_distribution",
            tight_layout=True,
            subdir=config.SUITE_PNG_SUBDIRS.get(suite, suite),
        )
        plt.close(fig)

        print(
            f"[+] Time metrics visualization created for suite={suite} ({n_models} models)"
        )

    def plot_distribution(self, top_n: int = None, per_suite: bool = False):
        """Create box plot of elapsed time distribution with success-conditioned mean markers.

        When per_suite=True, generates one plot per target suite.
        """
        if per_suite:
            suites = sorted({key.split("::", 1)[1] for key in self.task_results})
            for suite in suites:
                self._plot_for_suite(suite, top_n=top_n)
            return None

        # Legacy combined chart
        time_data = {}
        passed_time_data = {}
        for key, tasks in self.task_results.items():
            model = key.split("::", 1)[0]
            all_times = []
            passed_times = []
            for task in tasks:
                elapsed_ms = task.get("elapsedMs", 0)
                elapsed_sec = elapsed_ms / 1000
                all_times.append(elapsed_sec)
                if task.get("status") == "pass":
                    passed_times.append(elapsed_sec)
            if all_times:
                time_data[model] = all_times
                passed_time_data[model] = passed_times

        if not time_data:
            print("[SKIP] Time metrics visualization: No elapsed time data found")
            return

        median_times = {m: np.median(l) for m, l in time_data.items()}
        sorted_models = sorted(median_times.keys(), key=lambda x: median_times[x])

        if top_n and len(sorted_models) > top_n:
            sorted_models = sorted_models[-top_n:]

        data_to_plot = [time_data[m] for m in sorted_models]
        n_models = len(sorted_models)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        bp = ax.boxplot(
            data_to_plot,
            labels=[format_model_name(m) for m in sorted_models],
            patch_artist=True,
            vert=False,
            widths=0.6,
        )

        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.85)
            patch.set_edgecolor("black")
            patch.set_linewidth(config.EDGE_WIDTH)

        for whisker in bp["whiskers"]:
            whisker.set_linewidth(config.EDGE_WIDTH)
            whisker.set_color("black")
        for cap in bp["caps"]:
            cap.set_linewidth(config.EDGE_WIDTH)
            cap.set_color("black")
        for median in bp["medians"]:
            median.set_linewidth(2)
            median.set_color("darkred")

        for flier in bp["fliers"]:
            flier.set(marker="o", markerfacecolor="gray", markersize=4, alpha=0.5)

        for i, model in enumerate(sorted_models):
            passed_times = passed_time_data.get(model, [])
            if passed_times:
                mean_passed = np.mean(passed_times)
                ax.scatter(
                    mean_passed,
                    i + 1,
                    marker="D",
                    color="navy",
                    s=40,
                    zorder=5,
                    label="Mean (passed)" if i == 0 else None,
                )

            arr = np.array(time_data[model])
            _median_val, q25, q75 = compute_ci_median_iqr(arr)
            iqr = q75 - q25
            ax.annotate(
                f"IQR={iqr:.1f}s",
                xy=(q75, i + 1),
                xytext=(5, 0),
                textcoords="offset points",
                fontsize=config.FONT_SIZE_TICK - 1,
                va="center",
                color="gray",
            )

        ax.set_xlabel("Wall-Clock Time (seconds)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Time-to-Success Distribution (median + IQR)",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.grid(axis="x", alpha=0.3)
        ax.legend(loc="lower right", fontsize=config.FONT_SIZE_LEGEND)

        save_figure(fig, "05_time_metrics_distribution", tight_layout=True)
        plt.close(fig)

        print(f"[+] Time metrics visualization created ({n_models} models)")

        return fig
