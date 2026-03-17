"""Step efficiency visualization"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from typing import Dict
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
)
import config


class StepEfficiencyVisualizer:
    """Visualize trajectory length (step efficiency) across models"""

    def __init__(self, task_results_by_model: Dict[str, list]):
        """
        Args:
            task_results_by_model: Dict mapping model name to list of task results
        """
        self.task_results = task_results_by_model

    def _plot_for_suite(self, suite: str, top_n: int | None = None):
        """Create box plot of trajectory length distribution for a single suite."""
        suite_key_suffix = f"::{suite}"

        trajectory_data = {}
        for key, tasks in self.task_results.items():
            if not key.endswith(suite_key_suffix):
                continue
            model = key.split("::", 1)[0]
            lengths = []
            for task in tasks:
                analysis = task.get("analysis") or {}
                if "efficiency" in analysis:
                    traj_len = analysis["efficiency"].get("trajectoryLength", 0)
                    lengths.append(traj_len)
            if lengths:
                trajectory_data[model] = lengths

        if not trajectory_data:
            print(
                f"[SKIP] Step efficiency visualization: No trajectory data for suite={suite}"
            )
            return

        median_lengths = {m: np.median(l) for m, l in trajectory_data.items()}
        sorted_models = sorted(median_lengths.keys(), key=lambda x: median_lengths[x])

        if top_n and len(sorted_models) > top_n:
            sorted_models = sorted_models[-top_n:]

        data_to_plot = [trajectory_data[m] for m in sorted_models]
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

        ax.set_xlabel("Trajectory Length (Steps)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            f"Step Efficiency Distribution – {suite}",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(
            fig,
            "03_step_efficiency_distribution",
            tight_layout=True,
            subdir=config.SUITE_PNG_SUBDIRS.get(suite, suite),
        )
        plt.close(fig)

        print(
            f"[+] Step efficiency visualization created for suite={suite} ({n_models} models)"
        )

    def plot_distribution(self, top_n: int = None, per_suite: bool = False):
        """Create box plot of trajectory length distribution across models.

        When per_suite=True, generates one plot per target suite into its
        own directory for clarity.
        """
        if per_suite:
            suites = sorted({key.split("::", 1)[1] for key in self.task_results})
            for suite in suites:
                self._plot_for_suite(suite, top_n=top_n)
            return None

        # Legacy combined chart (unused in the current workflow)
        trajectory_data = {}
        for key, tasks in self.task_results.items():
            model = key.split("::", 1)[0]
            lengths = []
            for task in tasks:
                analysis = task.get("analysis") or {}
                if "efficiency" in analysis:
                    traj_len = analysis["efficiency"].get("trajectoryLength", 0)
                    lengths.append(traj_len)
            if lengths:
                trajectory_data[model] = lengths

        if not trajectory_data:
            print("[SKIP] Step efficiency visualization: No trajectory data found")
            return

        median_lengths = {m: np.median(l) for m, l in trajectory_data.items()}
        sorted_models = sorted(median_lengths.keys(), key=lambda x: median_lengths[x])

        if top_n and len(sorted_models) > top_n:
            sorted_models = sorted_models[-top_n:]

        data_to_plot = [trajectory_data[m] for m in sorted_models]
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

        ax.set_xlabel("Trajectory Length (Steps)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Step Efficiency Distribution (Trajectory Length)",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "03_step_efficiency_distribution", tight_layout=True)
        plt.close(fig)

        print(f"[+] Step efficiency visualization created ({n_models} models)")

        return fig
