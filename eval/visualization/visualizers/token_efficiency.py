"""Token efficiency visualization"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
    compute_ci_median_iqr,
)
import config


class TokenEfficiencyVisualizer:
    """Visualize token usage across models"""

    def __init__(self, aggregated_data: pd.DataFrame):
        """
        Args:
            aggregated_data: DataFrame with token statistics per model
        """
        self.data = aggregated_data.copy()

    def plot_input_tokens(self, top_n: int = None):
        """Create input token efficiency chart"""
        plot_data = self.data.sort_values("mean_input_tokens", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        y_pos = np.arange(n_models)
        means = plot_data["mean_input_tokens"].values

        # Error bars from min/max or std
        if "std_input_tokens" in plot_data.columns:
            errors = plot_data["std_input_tokens"].values
        else:
            errors = np.zeros_like(means)

        bars = ax.barh(
            y_pos,
            means,
            xerr=errors,
            color=colors,
            alpha=0.85,
            capsize=5,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
            ecolor="black",
        )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Mean Input Tokens per Task", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title("Input Token Efficiency", fontsize=config.FONT_SIZE_TITLE, pad=15)
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "02a_token_efficiency_input", tight_layout=True)
        plt.close(fig)

        print(f"[+] Input token efficiency visualization created ({n_models} models)")

    def plot_output_tokens(self, top_n: int = None):
        """Create output token efficiency chart"""
        plot_data = self.data.sort_values("mean_output_tokens", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        y_pos = np.arange(n_models)
        means = plot_data["mean_output_tokens"].values

        if "std_output_tokens" in plot_data.columns:
            errors = plot_data["std_output_tokens"].values
        else:
            errors = np.zeros_like(means)

        bars = ax.barh(
            y_pos,
            means,
            xerr=errors,
            color=colors,
            alpha=0.85,
            capsize=5,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
            ecolor="black",
        )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Mean Output Tokens per Task", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title("Output Token Efficiency", fontsize=config.FONT_SIZE_TITLE, pad=15)
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "02b_token_efficiency_output", tight_layout=True)
        plt.close(fig)

        print(f"[+] Output token efficiency visualization created ({n_models} models)")

    def plot_total_tokens(self, top_n: int = None):
        """Create total token cost chart"""
        plot_data = self.data.sort_values("mean_total_tokens", ascending=True)

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        y_pos = np.arange(n_models)
        means = plot_data["mean_total_tokens"].values

        if "std_total_tokens" in plot_data.columns:
            errors = plot_data["std_total_tokens"].values
        else:
            errors = np.zeros_like(means)

        bars = ax.barh(
            y_pos,
            means,
            xerr=errors,
            color=colors,
            alpha=0.85,
            capsize=5,
            edgecolor="black",
            linewidth=config.EDGE_WIDTH,
            ecolor="black",
        )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(
            [format_model_name(m) for m in plot_data["model"]],
            fontsize=config.FONT_SIZE_TICK - 1,
        )
        ax.set_xlabel("Mean Total Tokens per Task", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            "Total Token Cost (Input + Output)", fontsize=config.FONT_SIZE_TITLE, pad=15
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, "02c_token_efficiency_total", tight_layout=True)
        plt.close(fig)

        print(f"[+] Total token efficiency visualization created ({n_models} models)")
