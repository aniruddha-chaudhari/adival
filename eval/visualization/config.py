"""Configuration for visualization generation"""

import os
from pathlib import Path

# Default paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
EVAL_RESULTS_DIR = PROJECT_ROOT / "eval" / "eval-results"
OUTPUT_DIR = Path(__file__).parent / "outputs"
PNG_DIR = OUTPUT_DIR / "png"
VECTOR_DIR = OUTPUT_DIR / "vector"
DATA_DIR = OUTPUT_DIR / "data"

# Target models and suites for focused visualizations
# (used to reduce clutter and match paper figures)
TARGET_MODELS = [
    "github-copilot/claude-sonnet-4.6",
    "github-copilot/gemini-3-flash-preview",
    "github-copilot/gpt-5.3-codex",
    "github-copilot/grok-code-fast-1",
    "opencode/minimax-m2.5-free",
]

# Logical suite/domain identifiers in eval-results
TARGET_SUITES = [
    "web-browsing-hard",
    "web-browsing-hard-pinchtab",
    "web-browsing-hard-playwright-mcp",
]

# Mapping from eval domain name -> PNG subdirectory name
SUITE_PNG_SUBDIRS = {
    "web-browsing-hard": "web-browsing-hard-agent-browser",
    "web-browsing-hard-pinchtab": "web-browsing-hard-pinchtab",
    "web-browsing-hard-playwright-mcp": "web-browsing-hard-playwright-mcp",
}

# Visualization settings
FIGURE_DPI_SCREEN = 100
FIGURE_DPI_PNG = 300
FIGURE_DPI_PDF = 300

# Figure dimensions (in inches)
FIGURE_WIDTH_SINGLE = 4.5
FIGURE_HEIGHT_SINGLE = 4.5
FIGURE_WIDTH_DOUBLE = 8.0
FIGURE_HEIGHT_DOUBLE = 6.0

# Multi-model comparison settings
TOP_N_MODELS_DEFAULT = 10
HEATMAP_MODELS_MAX = 50  # Max models to show in heatmap (will scale width)
HEATMAP_BASE_WIDTH = 10  # Base width for heatmap, scales with model count

# Color palette (ColorBrewer Set2/Set3, colorblind-safe)
COLOR_PALETTE = [
    "#66c2a5",
    "#fc8d62",
    "#8da0cb",
    "#e78ac3",
    "#a6d854",
    "#ffd92f",
    "#e5c494",
    "#b3b3b3",
    "#1b9e77",
    "#d95f02",
    "#7570b3",
    "#e7298a",
    "#66a61e",
    "#e6ab02",
    "#a6761d",
]

# Style settings for publication-quality plots
STYLE_PRESET = "science"  # From scienceplots
FONT_FAMILY = "sans-serif"
FONT_SIZE_TITLE = 11
FONT_SIZE_LABEL = 10
FONT_SIZE_TICK = 8
FONT_SIZE_LEGEND = 9
LINE_WIDTH = 1.5
EDGE_WIDTH = 0.8
USE_LATEX = False  # Disable LaTeX rendering (not available on all systems)

# Statistical settings
USE_MEDIAN_IQR = True  # Use median ± IQR instead of mean ± std
CONFIDENCE_LEVEL = 0.95  # 95% CI
CI_ALPHA_FILL = 0.25  # Alpha for confidence interval shading

# Output formats
SAVE_PNG = True
SAVE_PDF = True
SAVE_CSV = True

# Plotting backend
BACKEND = "Agg"  # Non-interactive backend

# Model comparison tiers
TIER_1_TOP_N = 10  # Top N models for detailed comparison
TIER_2_ALL = True  # Show all models in heatmap
