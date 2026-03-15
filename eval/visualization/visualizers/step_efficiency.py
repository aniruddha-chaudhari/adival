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

    def plot_distribution(self, top_n: int = None):
        """Create box plot of trajectory length distribution across models"""

        # Extract trajectory lengths per model
        trajectory_data = {}
        for model, tasks in self.task_results.items():
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

        # Sort by median trajectory length
        median_lengths = {m: np.median(l) for m, l in trajectory_data.items()}
        sorted_models = sorted(median_lengths.keys(), key=lambda x: median_lengths[x])

        if top_n and len(sorted_models) > top_n:
            sorted_models = sorted_models[-top_n:]

        # Prepare data for box plot
        data_to_plot = [trajectory_data[m] for m in sorted_models]
        n_models = len(sorted_models)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        # Create box plot
        bp = ax.boxplot(
            data_to_plot,
            labels=[format_model_name(m) for m in sorted_models],
            patch_artist=True,
            vert=False,
            widths=0.6,
        )

        # Customize box colors
        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.85)
            patch.set_edgecolor("black")
            patch.set_linewidth(config.EDGE_WIDTH)

        # Customize whiskers and caps
        for whisker in bp["whiskers"]:
            whisker.set_linewidth(config.EDGE_WIDTH)
            whisker.set_color("black")
        for cap in bp["caps"]:
            cap.set_linewidth(config.EDGE_WIDTH)
            cap.set_color("black")
        for median in bp["medians"]:
            median.set_linewidth(2)
            median.set_color("darkred")

        # Customize fliers (outliers)
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
