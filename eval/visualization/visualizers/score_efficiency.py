"""Score efficiency visualization"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
)
import config


class ScoreEfficiencyVisualizer:
    """Visualize score efficiency metrics across models and domains"""

    def __init__(self, aggregated_data: pd.DataFrame, task_results_by_model: dict):
        """
        Args:
            aggregated_data: DataFrame with one row per (model, domain) run
            task_results_by_model: Dict keyed by "model::domain" with task result lists
        """
        self.data = aggregated_data.copy()
        self.task_results_by_model = task_results_by_model

    def plot_score_per_token(self):
        """Horizontal bar chart of score per 1k tokens, sorted descending."""
        df = self.data.copy()

        # Filter rows with valid token data
        valid = df[df["mean_total_tokens"] > 0].copy()

        if valid.empty:
            print("[SKIP] score_per_token: no rows with mean_total_tokens > 0")
            return

        valid["score_per_1k_tokens"] = valid["mean_score"] / (
            valid["mean_total_tokens"] / 1000.0
        )
        valid["label"] = (
            valid["model"].apply(format_model_name) + " / " + valid["domain"]
        )

        plot_data = valid.sort_values("score_per_1k_tokens", ascending=True)

        n_rows = len(plot_data)
        width, height = set_figure_width_by_model_count(n_rows, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_rows)

        y_pos = np.arange(n_rows)
        values = plot_data["score_per_1k_tokens"].values

        ax.barh(
            y_pos,
            values,
            color=colors,
            alpha=0.85,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
        )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            plot_data["label"].tolist(),
            fontsize=config.FONT_SIZE_TICK,
        )
        ax.set_xlabel("Score per 1k Tokens", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title("Score per 1k Tokens", fontsize=config.FONT_SIZE_TITLE, pad=15)
        ax.tick_params(axis="x", labelsize=config.FONT_SIZE_TICK)
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "10_score_per_token", tight_layout=True)
        plt.close(fig)

        print("[+] score_per_token created")

    def plot_speed_vs_score(self):
        """Scatter plot: mean time per task (x) vs pass rate (y), colored by model."""
        df = self.data.copy()

        if df.empty:
            print("[SKIP] speed_vs_score: no data")
            return

        unique_models = df["model"].unique().tolist()
        n_models = len(unique_models)
        palette = get_color_palette(n_models)
        color_map = {model: palette[i] for i, model in enumerate(unique_models)}

        fig, ax = plt.subplots(
            figsize=(config.FIGURE_WIDTH_DOUBLE, config.FIGURE_HEIGHT_DOUBLE)
        )

        # Scatter points per model, legend instead of text labels to avoid clutter
        for model in unique_models:
            subset = df[df["model"] == model]
            ax.scatter(
                subset["mean_elapsed_sec_all"],
                subset["success_rate"],
                color=color_map[model],
                s=60,
                alpha=0.8,
                zorder=3,
                label=format_model_name(model),
            )

        ax.set_xlabel("Mean Time per Task (s)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Pass Rate (%)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title("Speed vs. Pass Rate", fontsize=config.FONT_SIZE_TITLE, pad=15)
        ax.tick_params(axis="both", labelsize=config.FONT_SIZE_TICK)
        ax.grid(alpha=0.3)
        ax.legend(
            loc="lower right",
            frameon=False,
            fontsize=config.FONT_SIZE_LEGEND,
            ncol=1,
        )

        save_figure(fig, "11_speed_vs_score", tight_layout=True)
        plt.close(fig)

        print("[+] speed_vs_score created")

    def plot_thrash_vs_score(self):
        """Scatter plot: thrash ratio (x) vs pass rate (y), colored by model."""
        df = self.data.copy()

        if df.empty:
            print("[SKIP] thrash_vs_score: no data")
            return

        unique_models = df["model"].unique().tolist()
        n_models = len(unique_models)
        palette = get_color_palette(n_models)
        color_map = {model: palette[i] for i, model in enumerate(unique_models)}

        fig, ax = plt.subplots(
            figsize=(config.FIGURE_WIDTH_DOUBLE, config.FIGURE_HEIGHT_DOUBLE)
        )

        for model in unique_models:
            subset = df[df["model"] == model]
            ax.scatter(
                subset["thrash_ratio"],
                subset["success_rate"],
                color=color_map[model],
                s=60,
                alpha=0.8,
                zorder=3,
                label=format_model_name(model),
            )

        ax.set_xlabel("Mean Thrash Ratio", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Pass Rate (%)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Thrash Ratio vs. Pass Rate", fontsize=config.FONT_SIZE_TITLE, pad=15
        )
        ax.tick_params(axis="both", labelsize=config.FONT_SIZE_TICK)
        ax.grid(alpha=0.3)
        ax.legend(
            loc="lower right",
            frameon=False,
            fontsize=config.FONT_SIZE_LEGEND,
            ncol=1,
        )

        save_figure(fig, "12_thrash_vs_score", tight_layout=True)
        plt.close(fig)

        print("[+] thrash_vs_score created")
