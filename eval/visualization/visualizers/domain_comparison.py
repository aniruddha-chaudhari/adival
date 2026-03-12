"""Domain comparison visualizations"""

import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
from .utils import (
    save_figure,
    get_color_palette,
    format_model_name,
    set_figure_width_by_model_count,
)
import config


class DomainComparisonVisualizer:
    """Visualize task metrics broken down by domain across models"""

    def __init__(self, aggregated_data: pd.DataFrame):
        """
        Args:
            aggregated_data: DataFrame with columns:
                model, domain, total_tasks, passed_tasks, success_rate,
                mean_score, mean_total_tokens, mean_elapsed_sec_all,
                thrash_ratio, safety_score
        """
        self.data = aggregated_data.copy()

    def plot_pass_rate_by_domain(self):
        """Grouped bar chart of pass rate per domain, one bar per model per domain."""
        if self.data.empty:
            print("[SKIP] Domain pass rate comparison: No data available")
            return

        domains = sorted(self.data["domain"].unique())
        models = sorted(self.data["model"].unique())
        n_domains = len(domains)
        n_models = len(models)

        colors = get_color_palette(n_models)
        model_color = {m: colors[i] for i, m in enumerate(models)}

        width, height = set_figure_width_by_model_count(
            n_domains * max(n_models, 1), base_height=5
        )
        fig, ax = plt.subplots(figsize=(width, height))

        bar_width = 0.8 / max(n_models, 1)
        x = np.arange(n_domains)

        for i, model in enumerate(models):
            model_data = self.data[self.data["model"] == model]
            rates = []
            for domain in domains:
                row = model_data[model_data["domain"] == domain]
                rates.append(
                    float(row["success_rate"].iloc[0]) if not row.empty else 0.0
                )

            offset = (i - (n_models - 1) / 2) * bar_width
            ax.bar(
                x + offset,
                rates,
                width=bar_width * 0.9,
                label=format_model_name(model),
                color=model_color[model],
                alpha=0.85,
                edgecolor="black",
                linewidth=config.EDGE_WIDTH,
            )

        ax.set_xticks(x)
        ax.set_xticklabels(
            domains,
            fontsize=config.FONT_SIZE_TICK,
            rotation=45 if n_domains > 3 else 0,
            ha="right" if n_domains > 3 else "center",
        )
        ax.set_ylabel("Pass Rate (%)", fontsize=config.FONT_SIZE_LABEL)
        ax.set_xlabel("Domain", fontsize=config.FONT_SIZE_LABEL)
        ax.set_title("Pass Rate by Domain", fontsize=config.FONT_SIZE_TITLE, pad=15)
        ax.set_ylim(0, 105)
        ax.grid(axis="y", alpha=0.3)
        ax.legend(
            loc="upper right",
            frameon=False,
            fontsize=config.FONT_SIZE_LEGEND,
        )

        save_figure(fig, "08_domain_pass_rate_comparison", tight_layout=True)
        plt.close(fig)

        print(
            f"[+] Domain pass rate comparison created ({n_models} models, {n_domains} domains)"
        )

        return fig

    def plot_score_heatmap(self):
        """Heatmap of mean_score: rows = models, columns = domains."""
        domains = self.data["domain"].unique()
        if len(domains) < 2:
            print("[SKIP] Domain score heatmap: Fewer than 2 unique domains")
            return

        pivot = pd.pivot_table(
            self.data,
            values="mean_score",
            index="model",
            columns="domain",
            aggfunc="mean",
        )

        n_models = len(pivot.index)
        n_domains = len(pivot.columns)

        width = max(6, n_domains * 1.2)
        height = max(4, n_models * 0.6)

        fig, ax = plt.subplots(figsize=(width, height))

        sns.heatmap(
            pivot,
            annot=True,
            fmt=".1f",
            cmap="RdYlGn",
            vmin=0,
            vmax=100,
            ax=ax,
            linewidths=0.5,
            linecolor="white",
            cbar_kws={"label": "Mean Score (0-100)"},
        )

        ax.set_title(
            "Mean Score by Model and Domain",
            fontsize=config.FONT_SIZE_TITLE,
            pad=15,
        )
        ax.set_xlabel("Domain", fontsize=config.FONT_SIZE_LABEL)
        ax.set_ylabel("Model", fontsize=config.FONT_SIZE_LABEL)

        ax.set_xticklabels(
            ax.get_xticklabels(),
            rotation=45 if n_domains > 3 else 0,
            ha="right" if n_domains > 3 else "center",
            fontsize=config.FONT_SIZE_TICK,
        )
        ax.set_yticklabels(
            ax.get_yticklabels(),
            rotation=0,
            fontsize=config.FONT_SIZE_TICK,
        )

        save_figure(fig, "09_domain_score_heatmap", tight_layout=True)
        plt.close(fig)

        print(
            f"[+] Domain score heatmap created ({n_models} models, {n_domains} domains)"
        )

        return fig
