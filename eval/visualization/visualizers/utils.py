"""Utility functions for visualization"""

import matplotlib.pyplot as plt
import matplotlib as mpl
import seaborn as sns
import numpy as np
from pathlib import Path
from typing import Tuple, List, Dict, Any, Optional
import scienceplots
import config

# Apply science style globally
plt.style.use(config.STYLE_PRESET)
mpl.use(config.BACKEND)


def setup_matplotlib_style():
    """Configure matplotlib for publication-quality plots"""
    mpl.rcParams.update(
        {
            "figure.dpi": config.FIGURE_DPI_SCREEN,
            "savefig.dpi": config.FIGURE_DPI_PNG,
            "font.family": config.FONT_FAMILY,
            "font.size": config.FONT_SIZE_LABEL,
            "axes.labelsize": config.FONT_SIZE_LABEL,
            "axes.titlesize": config.FONT_SIZE_TITLE,
            "xtick.labelsize": config.FONT_SIZE_TICK,
            "ytick.labelsize": config.FONT_SIZE_TICK,
            "legend.fontsize": config.FONT_SIZE_LEGEND,
            "axes.linewidth": config.EDGE_WIDTH,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.spines.left": True,
            "axes.spines.bottom": True,
            "xtick.direction": "out",
            "ytick.direction": "out",
            "grid.alpha": 0.3,
            "grid.linestyle": "-",
            "legend.frameon": False,
            "figure.figsize": (config.FIGURE_WIDTH_SINGLE, config.FIGURE_HEIGHT_SINGLE),
            "text.usetex": False,  # Disable LaTeX
        }
    )


def get_color_palette(n_colors: int) -> List[str]:
    """Get a colorblind-safe palette for n colors"""
    if n_colors <= len(config.COLOR_PALETTE):
        return config.COLOR_PALETTE[:n_colors]
    else:
        # Repeat palette if more colors needed
        return (config.COLOR_PALETTE * ((n_colors // len(config.COLOR_PALETTE)) + 1))[
            :n_colors
        ]


def save_figure(
    fig: plt.Figure,
    name: str,
    tight_layout: bool = True,
    subdir: Optional[str] = None,
):
    """Save figure in both PNG and PDF formats.

    Args:
        fig: Matplotlib figure to save.
        name: Base filename (without extension).
        tight_layout: Whether to call tight_layout() before saving.
        subdir: Optional PNG/PDF subdirectory under the standard
            output dirs. Used to route suite-specific charts into
            per-suite folders (e.g., web-browsing-hard-pinchtab).
    """
    if tight_layout:
        fig.tight_layout()

    png_root = config.PNG_DIR
    pdf_root = config.VECTOR_DIR
    if subdir:
        png_root = png_root / subdir
        pdf_root = pdf_root / subdir
        png_root.mkdir(parents=True, exist_ok=True)
        pdf_root.mkdir(parents=True, exist_ok=True)

    # Save PNG
    if config.SAVE_PNG:
        png_path = png_root / f"{name}.png"
        fig.savefig(png_path, dpi=config.FIGURE_DPI_PNG, bbox_inches="tight")
        print(f"  [+] PNG saved: {png_path}")

    # Save PDF
    if config.SAVE_PDF:
        pdf_path = pdf_root / f"{name}.pdf"
        fig.savefig(
            pdf_path, dpi=config.FIGURE_DPI_PDF, bbox_inches="tight", format="pdf"
        )
        print(f"  [+] PDF saved: {pdf_path}")


def compute_ci_median_iqr(data: np.ndarray) -> Tuple[float, float, float]:
    """Compute median and IQR (25th-75th percentile)

    Returns:
        (median, q25, q75)
    """
    median = np.median(data)
    q25 = np.percentile(data, 25)
    q75 = np.percentile(data, 75)
    return median, q25, q75


def normalize_metrics(values: np.ndarray) -> np.ndarray:
    """Normalize values to 0-1 range for heatmap"""
    min_val = np.nanmin(values)
    max_val = np.nanmax(values)
    if max_val == min_val:
        return np.ones_like(values) * 0.5
    return (values - min_val) / (max_val - min_val)


def format_model_name(model_str: str) -> str:
    """Format model name for display (keep full name, just clean up)"""
    # Remove leading/trailing whitespace
    return model_str.strip()


def set_figure_width_by_model_count(
    n_models: int, base_height: float = 4.5
) -> Tuple[float, float]:
    """Calculate figure dimensions based on number of models

    For many models, width scales automatically
    """
    # Minimum 0.3 inches per model for readability
    width = max(6, n_models * 0.4)
    height = base_height
    return width, height


def add_significance_stars(
    ax, p_value: float, x_pos: float, y_pos: float, fontsize: int = 12
):
    """Add significance stars based on p-value

    *** p < 0.001
    **  p < 0.01
    *   p < 0.05
    ns  p >= 0.05
    """
    if p_value < 0.001:
        star = "***"
    elif p_value < 0.01:
        star = "**"
    elif p_value < 0.05:
        star = "*"
    else:
        star = "ns"

    ax.text(
        x_pos, y_pos, star, ha="center", va="bottom", fontsize=fontsize, weight="bold"
    )


def create_output_dirs():
    """Ensure all output directories exist"""
    config.PNG_DIR.mkdir(parents=True, exist_ok=True)
    config.VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
