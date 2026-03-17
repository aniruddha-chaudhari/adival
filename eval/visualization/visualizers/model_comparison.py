"""Model comparison visualizations (heatmap, etc.)"""

import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
from .utils import save_figure, normalize_metrics, format_model_name
import config


class ModelComparisonVisualizer:
    """Create comparative visualizations across models"""

    def __init__(self, aggregated_data: pd.DataFrame):
        """
        Args:
            aggregated_data: DataFrame with all metrics per model
        """
        self.data = aggregated_data.copy()

    def _plot_heatmap_for_suite(self, suite: str, top_n: int | None = None):
        """Create heatmap of all metrics for a single suite/domain."""
        data = self.data[self.data["domain"] == suite].copy()
        if data.empty:
            print(f"[SKIP] Model comparison heatmap: no data for suite={suite}")
            return

        # mean_elapsed_sec_all is the all-tasks mean; fall back to mean_elapsed_sec
        # (pass-conditioned, present in older aggregated data) if not available.
        metric_cols = [
            "success_rate",
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_total_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
            "safety_score",
            "thrash_ratio",
        ]

        # Metrics where a LOWER value is better.
        # These are inverted (1 - norm) so the RdYlGn colormap
        # consistently shows green=good, red=bad (Bug D fix).
        LOWER_IS_BETTER = {
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_total_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
            "thrash_ratio",
        }

        # Filter to metrics that exist
        available_metrics = [col for col in metric_cols if col in data.columns]

        if not available_metrics:
            print("[SKIP] Model comparison heatmap: No metrics data found")
            return

        plot_data = data.copy()

        # Sort by success rate
        if "success_rate" in plot_data.columns:
            plot_data = plot_data.sort_values("success_rate", ascending=False)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.head(top_n)

        # Prepare matrix
        heatmap_data = plot_data[available_metrics].copy()

        # Normalize each metric to 0-1 scale.
        # Lower-is-better metrics are inverted so green always means "good".
        for col in heatmap_data.columns:
            normed = normalize_metrics(heatmap_data[col].values)
            heatmap_data[col] = (1 - normed) if col in LOWER_IS_BETTER else normed

        # Set index to model names
        heatmap_data.index = [
            f"{format_model_name(m)} - {d}"
            for m, d in zip(plot_data["model"], plot_data["domain"])
        ]

        # Create figure with appropriate size
        n_models = len(heatmap_data)
        width = max(8, n_models * 0.45)
        height = max(6, n_models * 0.4)

        fig, ax = plt.subplots(figsize=(width, height))

        # Create heatmap
        sns.heatmap(
            heatmap_data,
            annot=True,
            fmt=".2f",
            cmap="RdYlGn",
            cbar_kws={"label": "Normalized Score (0-1)"},
            ax=ax,
            linewidths=0.5,
            linecolor="white",
            vmin=0,
            vmax=1,
            square=False,
        )

        ax.set_title(
            f"Model Comparison (Normalized Metrics) – {suite}",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.set_xlabel("Metrics", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Models", fontsize=config.FONT_SIZE_LABEL)

        # Rotate labels for readability
        ax.set_xticklabels(
            ax.get_xticklabels(),
            rotation=45,
            ha="right",
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_yticklabels(
            ax.get_yticklabels(), rotation=0, fontsize=config.FONT_SIZE_TICK - 1
        )

        save_figure(
            fig,
            "06_model_comparison_heatmap",
            tight_layout=True,
            subdir=config.SUITE_PNG_SUBDIRS.get(suite, suite),
        )
        plt.close(fig)

        print(
            f"[+] Model comparison heatmap created for suite={suite} ({n_models} models)"
        )

    def plot_heatmap(self, top_n: int = None, per_suite: bool = False):
        """Create heatmap of all metrics across models.

        Args:
            top_n: Show only top N models by success rate (optional)
            per_suite: If True, generate one heatmap per target suite.
        """
        if per_suite:
            for suite in config.TARGET_SUITES:
                self._plot_heatmap_for_suite(suite, top_n=top_n)
            return None

        # Legacy combined heatmap
        metric_cols = [
            "success_rate",
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_total_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
            "safety_score",
            "thrash_ratio",
        ]

        LOWER_IS_BETTER = {
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_total_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
            "thrash_ratio",
        }

        available_metrics = [col for col in metric_cols if col in self.data.columns]

        if not available_metrics:
            print("[SKIP] Model comparison heatmap: No metrics data found")
            return

        plot_data = self.data.copy()

        if "success_rate" in plot_data.columns:
            plot_data = plot_data.sort_values("success_rate", ascending=False)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.head(top_n)

        heatmap_data = plot_data[available_metrics].copy()

        for col in heatmap_data.columns:
            normed = normalize_metrics(heatmap_data[col].values)
            heatmap_data[col] = (1 - normed) if col in LOWER_IS_BETTER else normed

        heatmap_data.index = [format_model_name(m) for m in plot_data["model"]]

        n_models = len(heatmap_data)
        width = max(8, n_models * 0.5)
        height = max(6, n_models * 0.4)

        fig, ax = plt.subplots(figsize=(width, height))

        sns.heatmap(
            heatmap_data,
            annot=True,
            fmt=".2f",
            cmap="RdYlGn",
            cbar_kws={"label": "Normalized Score (0-1)"},
            ax=ax,
            linewidths=0.5,
            linecolor="white",
            vmin=0,
            vmax=1,
            square=False,
        )

        ax.set_title(
            "Model Comparison: All Metrics (Normalized)",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.set_xlabel("Metrics", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Models", fontsize=config.FONT_SIZE_LABEL)

        ax.set_xticklabels(
            ax.get_xticklabels(),
            rotation=45,
            ha="right",
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_yticklabels(
            ax.get_yticklabels(), rotation=0, fontsize=config.FONT_SIZE_TICK - 1
        )

        save_figure(fig, "06_model_comparison_heatmap", tight_layout=True)
        plt.close(fig)

        print(f"[+] Model comparison heatmap created ({n_models} models)")

        return fig

    def plot_top_models_radar(self, top_n: int = 5, output_subdir: str | None = None):
        """Create detailed comparison of top N models

        Args:
            top_n: Number of top models to compare
        """

        metric_cols = [
            "success_rate",
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
            "safety_score",
        ]

        LOWER_IS_BETTER = {
            "mean_input_tokens",
            "mean_output_tokens",
            "mean_elapsed_sec_all",
            "mean_elapsed_sec",
            "mean_trajectory_length",
        }

        available_metrics = [col for col in metric_cols if col in self.data.columns]

        if not available_metrics:
            print("[SKIP] Top models comparison: No metrics data found")
            return

        plot_data = self.data.copy()

        # Sort by success rate and take top N
        if "success_rate" in plot_data.columns:
            plot_data = plot_data.sort_values("success_rate", ascending=False)

        plot_data = plot_data.head(min(top_n, len(plot_data)))

        # Prepare matrix
        heatmap_data = plot_data[available_metrics].copy()

        # Normalize each metric; invert lower-is-better so green=good throughout
        for col in heatmap_data.columns:
            normed = normalize_metrics(heatmap_data[col].values)
            heatmap_data[col] = (1 - normed) if col in LOWER_IS_BETTER else normed

        heatmap_data.index = [format_model_name(m) for m in plot_data["model"]]

        # Create figure
        fig, ax = plt.subplots(figsize=(6, 4))

        # Create heatmap for top models
        sns.heatmap(
            heatmap_data,
            annot=True,
            fmt=".2f",
            cmap="RdYlGn",
            cbar_kws={"label": "Normalized Score (0-1)"},
            ax=ax,
            linewidths=1,
            linecolor="white",
            vmin=0,
            vmax=1,
            square=False,
            cbar=True,
        )

        ax.set_title(
            f"Top {min(top_n, len(plot_data))} Models: Detailed Comparison",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.set_xlabel("Metrics", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Models", fontsize=config.FONT_SIZE_LABEL)

        ax.set_xticklabels(
            ax.get_xticklabels(),
            rotation=45,
            ha="right",
            fontsize=config.FONT_SIZE_TICK,
        )
        ax.set_yticklabels(
            ax.get_yticklabels(), rotation=0, fontsize=config.FONT_SIZE_TICK
        )

        save_figure(
            fig,
            "07_top_models_comparison",
            tight_layout=True,
            subdir=output_subdir,
        )
        plt.close(fig)

        print(
            f"[+] Top models comparison created ({min(top_n, len(plot_data))} models)"
        )

        return fig
