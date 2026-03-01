"""Success Rate visualization"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
)
import config


class SuccessRateVisualizer:
    """Visualize task success rates across models"""

    def __init__(self, aggregated_data: pd.DataFrame):
        """
        Args:
            aggregated_data: DataFrame with columns:
                - model: Model name
                - total_tasks: Total number of tasks
                - passed_tasks: Number of passed tasks
                - partial_tasks: Number of partial/failed tasks
        """
        self.data = aggregated_data.copy()
        self.data["success_rate"] = (
            self.data["passed_tasks"] / self.data["total_tasks"]
        ) * 100
        self.data["failure_rate"] = 100 - self.data["success_rate"]

    def plot(self, top_n: int = None):
        """Create success rate comparison chart

        Args:
            top_n: Show only top N models (optional)
        """
        # Sort by success rate descending
        plot_data = self.data.sort_values("success_rate", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=6)

        fig, ax = plt.subplots(figsize=(width, height))

        colors = get_color_palette(n_models)

        # Horizontal bar chart for success and failure
        y_pos = np.arange(n_models)
        success = plot_data["success_rate"].values
        failure = plot_data["failure_rate"].values

        # Create stacked horizontal bars
        ax.barh(
            y_pos,
            success,
            label="Passed",
            color=colors,
            alpha=0.85,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
        )
        ax.barh(
            y_pos,
            failure,
            left=success,
            label="Failed/Partial",
            color="#cccccc",
            alpha=0.6,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
        )

        # Labels and formatting
        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Success Rate (%)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Task Success Rate Across Models", fontsize=config.FONT_SIZE_TITLE, pad=15
        )
        ax.set_xlim([0, 100])

        # Add percentage labels on bars
        for i, (s, f) in enumerate(zip(success, failure)):
            if s > 5:  # Only show label if bar is wide enough
                ax.text(
                    s / 2,
                    i,
                    f"{s:.1f}%",
                    va="center",
                    ha="center",
                    fontsize=config.FONT_SIZE_TICK,
                    weight="bold",
                    color="white",
                )

        ax.legend(loc="lower right", frameon=False, fontsize=config.FONT_SIZE_LEGEND)
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "01_success_rate_comparison", tight_layout=True)
        plt.close(fig)

        print(f"[+] Success rate visualization created ({n_models} models)")

        return fig


class SuccessRateByDifficultyVisualizer:
    """Visualize success rates grouped by task difficulty (future feature)"""

    def plot(self):
        """Placeholder for difficulty-based breakdown"""
        print("[SKIP] Difficulty-based breakdown: Skipped (future implementation)")
