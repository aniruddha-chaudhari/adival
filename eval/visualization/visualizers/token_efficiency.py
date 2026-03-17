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

    def _plot_one(
        self,
        metric_col: str,
        std_col: str,
        title: str,
        filename: str,
        suite: str,
        top_n: int | None = None,
    ):
        subdir = config.SUITE_PNG_SUBDIRS.get(suite, suite)
        plot_data = self.data[(self.data["domain"] == suite)].sort_values(
            metric_col, ascending=True
        )

        if plot_data.empty:
            return

        if top_n and len(plot_data) > top_n:
            plot_data = plot_data.tail(top_n)

        n_models = len(plot_data)
        width, height = set_figure_width_by_model_count(n_models, base_height=5)

        fig, ax = plt.subplots(figsize=(width, height))
        colors = get_color_palette(n_models)

        y_pos = np.arange(n_models)
        means = plot_data[metric_col].values

        if std_col in plot_data.columns:
            errors = plot_data[std_col].values
        else:
            errors = np.zeros_like(means)

        ax.barh(
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
        ax.set_xlabel(title, fontsize=config.FONT_SIZE_LABEL)
        ax.set_title(
            f"{title} – {suite}",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.grid(axis="x", alpha=0.3)

        save_figure(fig, filename, tight_layout=True, subdir=subdir)
        plt.close(fig)

    def plot_input_tokens(self, top_n: int = None, per_suite: bool = False):
        """Create input token efficiency chart"""
        if per_suite:
            suites = sorted(self.data["domain"].dropna().unique())
            for suite in suites:
                self._plot_one(
                    metric_col="mean_input_tokens",
                    std_col="std_input_tokens",
                    title="Mean Input Tokens per Task",
                    filename="02a_token_efficiency_input",
                    suite=suite,
                    top_n=top_n,
                )
            return

        self._plot_one(
            metric_col="mean_input_tokens",
            std_col="std_input_tokens",
            title="Mean Input Tokens per Task",
            filename="02a_token_efficiency_input",
            suite=config.TARGET_SUITES[0],
            top_n=top_n,
        )

    def plot_output_tokens(self, top_n: int = None, per_suite: bool = False):
        """Create output token efficiency chart"""
        if per_suite:
            suites = sorted(self.data["domain"].dropna().unique())
            for suite in suites:
                self._plot_one(
                    metric_col="mean_output_tokens",
                    std_col="std_output_tokens",
                    title="Mean Output Tokens per Task",
                    filename="02b_token_efficiency_output",
                    suite=suite,
                    top_n=top_n,
                )
            return

        self._plot_one(
            metric_col="mean_output_tokens",
            std_col="std_output_tokens",
            title="Mean Output Tokens per Task",
            filename="02b_token_efficiency_output",
            suite=config.TARGET_SUITES[0],
            top_n=top_n,
        )

    def plot_total_tokens(self, top_n: int = None, per_suite: bool = False):
        """Create total token cost chart"""
        if per_suite:
            suites = sorted(self.data["domain"].dropna().unique())
            for suite in suites:
                self._plot_one(
                    metric_col="mean_total_tokens",
                    std_col="std_total_tokens",
                    title="Mean Total Tokens per Task",
                    filename="02c_token_efficiency_total",
                    suite=suite,
                    top_n=top_n,
                )
            return

        self._plot_one(
            metric_col="mean_total_tokens",
            std_col="std_total_tokens",
            title="Mean Total Tokens per Task",
            filename="02c_token_efficiency_total",
            suite=config.TARGET_SUITES[0],
            top_n=top_n,
        )
