"""Failure analysis visualization"""

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


class FailureAnalysisVisualizer:
    """Visualize failure modes and error categories"""

    def __init__(self, aggregated_data: pd.DataFrame):
        """
        Args:
            aggregated_data: DataFrame with error category counts per model
        """
        self.data = aggregated_data.copy()

    def _plot_for_suite(self, suite: str, top_n: int | None = None):
        """Create stacked bar chart of failure categories for a single suite."""
        error_categories = [
            "none",
            "comprehension",
            "execution",
            "resource",
            "navigation",
        ]

        data = self.data[self.data["domain"] == suite].copy()

        # Check which categories exist
        existing_cats = [
            cat for cat in error_categories if f"error_{cat}" in data.columns
        ]

        if not existing_cats:
            print("[SKIP] Failure analysis visualization: No error category data found")
            return

        plot_data = data

        # Sort by total failures
        plot_data["total_errors"] = plot_data[
            [f"error_{cat}" for cat in existing_cats]
        ].sum(axis=1)
        plot_data = plot_data.sort_values("total_errors", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=6)

        fig, ax = plt.subplots(figsize=(width, height))

        # Color map for categories
        category_colors = {
            "none": "#2ecc71",  # Green - success
            "comprehension": "#e74c3c",  # Red - comprehension error
            "execution": "#f39c12",  # Orange - execution error
            "resource": "#e67e22",  # Dark orange - resource error
            "navigation": "#9b59b6",  # Purple - navigation error
        }

        y_pos = np.arange(n_models)

        # Create stacked bars
        left = np.zeros(n_models)
        for cat in existing_cats:
            values = plot_data[f"error_{cat}"].values
            color = category_colors.get(cat, "#95a5a6")
            ax.barh(
                y_pos,
                values,
                left=left,
                label=cat.capitalize(),
                color=color,
                alpha=0.85,
                edgecolor="black",
                linewidth=config.EDGE_WIDTH,
            )
            left += values

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Number of Failures", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            f"Failure Analysis by Error Category – {suite}",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.legend(
            loc="lower right",
            frameon=False,
            fontsize=config.FONT_SIZE_LEGEND - 1,
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(
            fig,
            "04_failure_analysis_breakdown",
            tight_layout=True,
            subdir=config.SUITE_PNG_SUBDIRS.get(suite, suite),
        )
        plt.close(fig)

        print(f"[+] Failure analysis visualization created for suite={suite} ({n_models} models)")

    def plot_failure_breakdown(self, top_n: int = None, per_suite: bool = False):
        """Create stacked bar chart of failure categories.

        When per_suite=True, generates one plot per target suite.
        """
        if per_suite:
            for suite in config.TARGET_SUITES:
                self._plot_for_suite(suite, top_n=top_n)
            return None

        # Legacy combined chart
        error_categories = [
            "none",
            "comprehension",
            "execution",
            "resource",
            "navigation",
        ]

        existing_cats = [
            cat for cat in error_categories if f"error_{cat}" in self.data.columns
        ]

        if not existing_cats:
            print("[SKIP] Failure analysis visualization: No error category data found")
            return

        plot_data = self.data.copy()

        plot_data["total_errors"] = plot_data[
            [f"error_{cat}" for cat in existing_cats]
        ].sum(axis=1)
        plot_data = plot_data.sort_values("total_errors", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=6)

        fig, ax = plt.subplots(figsize=(width, height))

        category_colors = {
            "none": "#2ecc71",  # Green - success
            "comprehension": "#e74c3c",  # Red - comprehension error
            "execution": "#f39c12",  # Orange - execution error
            "resource": "#e67e22",  # Dark orange - resource error
            "navigation": "#9b59b6",  # Purple - navigation error
        }

        y_pos = np.arange(n_models)

        left = np.zeros(n_models)
        for cat in existing_cats:
            values = plot_data[f"error_{cat}"].values
            color = category_colors.get(cat, "#95a5a6")
            ax.barh(
                y_pos,
                values,
                left=left,
                label=cat.capitalize(),
                color=color,
                alpha=0.85,
                edgecolor="black",
                linewidth=config.EDGE_WIDTH,
            )
            left += values

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Number of Failures", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Failure Analysis by Error Category",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.legend(
            loc="lower right", frameon=False, fontsize=config.FONT_SIZE_LEGEND - 1
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "04_failure_analysis_breakdown", tight_layout=True)
        plt.close(fig)

        print(f"[+] Failure analysis visualization created ({n_models} models)")

        return fig
