# Evaluation Results Visualization

Generate publication-quality visualizations from browser agent evaluation results.

## Quick Start

```bash
cd eval/visualization

# Install dependencies (one-time)
uv add matplotlib seaborn scienceplots numpy pandas palettable scipy

# Generate visualizations
uv run python generate_visualizations.py
```

**Output:** All visualizations saved to `outputs/png/` and `outputs/vector/`

---

## Command Options

```bash
# Show only top 15 models in detailed comparisons
uv run python generate_visualizations.py --top-n 15

# Custom input/output directories
uv run python generate_visualizations.py --input-dir /path/to/eval-results --output-dir /path/to/outputs
```

---

## Generated Visualizations

| # | Chart | Purpose |
|---|---|---|
| **01** | Success Rate Comparison | Task completion % across models |
| **02a** | Token Efficiency (Input) | Input token cost per model |
| **02b** | Token Efficiency (Output) | Output token cost per model |
| **02c** | Token Efficiency (Total) | Total token cost comparison |
| **03** | Step Efficiency Distribution | Trajectory length (box plot) |
| **04** | Failure Analysis | Error categories breakdown |
| **05** | Time-to-Success | Wall-clock time distribution |
| **06** | Model Comparison Heatmap | All metrics vs all models |
| **07** | Top Models Comparison | Detailed view of best performers |
| **08** | Summary Table (CSV) | Data export for papers |

---

## Output Folders

```
outputs/
├── png/        # 300 DPI images (web, presentations)
├── vector/     # PDF vector graphics (LaTeX papers)
└── data/       # CSV tables (Excel, paper tables)
```

---

## Input Format

Script reads `summary.json` files from `eval/eval-results/`:

```json
{
  "model": "google/gemini-3-flash",
  "runAt": "2026-03-01T05:50:42.517Z",
  "results": [
    {
      "id": "EVAL_001",
      "status": "pass",
      "elapsedMs": 64092,
      "tokens": {
        "inputTokens": 85165,
        "outputTokens": 604,
        "totalTokens": 86867
      },
      "analysis": {
        "efficiency": { "trajectoryLength": 2 },
        "error": { "category": "none" },
        "safety": { "safetyScore": 100 },
        "thrashing": { "thrashRatio": 0 }
      }
    }
  ]
}
```

---

## Configuration

Edit `config.py` to customize:

```python
FIGURE_DPI_PNG = 300              # PNG image quality
FIGURE_DPI_PDF = 300              # PDF vector quality
TOP_N_MODELS_DEFAULT = 10         # Top models in comparisons
HEATMAP_MODELS_MAX = 50           # Models in heatmap
```

---

## Design Standards

- **ColorBrewer palettes** - Scientifically validated, colorblind-safe colors
- **Median ± IQR** - Robust statistical measure (not mean ± std)
- **Publication quality** - 300 DPI PNG + vector PDF
- **Auto-scaling** - Layouts adjust for 2 to 50+ models
- **Minimalist design** - Clean, clutter-free visualizations

---

## Using in Papers

### LaTeX/PDF Papers
```latex
\begin{figure}[ht]
  \centering
  \includegraphics[width=0.9\textwidth]{eval/visualization/outputs/vector/01_success_rate_comparison.pdf}
  \caption{Success rates across models}
\end{figure}
```

### Markdown/Web
```markdown
![Success Rate](eval/visualization/outputs/png/01_success_rate_comparison.png)
```

### Paper Tables
Import `outputs/data/evaluation_summary.csv` directly into Excel or use in Markdown tables.

---

## File Structure

```
eval/visualization/
├── generate_visualizations.py      # Main script
├── config.py                       # Settings (DPI, fonts, colors)
├── requirements.txt                # Python packages
├── README.md                       # This file
├── visualizers/                    # Chart modules
│   ├── utils.py                   # Styling & helpers
│   ├── success_rate.py
│   ├── token_efficiency.py
│   ├── step_efficiency.py
│   ├── failure_analysis.py
│   ├── time_metrics.py
│   └── model_comparison.py
└── outputs/
    ├── png/                        # Raster images
    ├── vector/                     # PDF graphics
    └── data/                       # CSV tables
```

---

## Troubleshooting

**Problem:** LaTeX errors
- **Fix:** LaTeX disabled by default. Edit `config.py: USE_LATEX = False`

**Problem:** Emoji encoding errors (Windows)
- **Fix:** Automatic - script uses text indicators instead

**Problem:** Memory issues with 100+ models
- **Fix:** Use `--top-n 50` to limit detailed comparisons

---

## Future Enhancements

See `@eval/task.md` for planned features:
- Statistical significance testing (Mann-Whitney U test)
- Task difficulty breakdown (performance-based categorization)
- Human baseline comparisons
- Robustness measurements

---

## Technical Stack

- **Matplotlib** - Base plotting library
- **Seaborn** - Statistical visualizations
- **SciencePlots** - Academic paper styles
- **Pandas** - Data aggregation
- **NumPy** - Numerical operations
- **Palettable** - ColorBrewer color palettes
