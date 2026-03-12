# Evaluation Results Visualization

Generate publication-quality visualizations from browser agent evaluation results.

## Quick Start

```bash
cd eval/visualization

# Run with the bundled Windows venv (all deps already installed)
.\.venv\Scripts\python.exe generate_visualizations.py

# Or, if you need to install deps fresh (one-time)
pip install matplotlib seaborn scienceplots numpy pandas palettable scipy
python generate_visualizations.py
```

Output is written to `outputs/png/` (300 DPI), `outputs/vector/` (PDF), and `outputs/data/` (CSV).

---

## CLI Usage

```bash
# Default: read from eval/eval-results/, write to outputs/
python generate_visualizations.py

# Custom paths
python generate_visualizations.py --input-dir /path/to/eval-results --output-dir /path/to/outputs

# Limit to top 10 (model, domain) series by pass rate
python generate_visualizations.py --top-n 10

# Filter to a single model (substring match)
python generate_visualizations.py --model "gpt-4o"

# Filter to a single domain
python generate_visualizations.py --domain "wikipedia"

# Combine filters
python generate_visualizations.py --model "gpt-4o" --domain "wikipedia" --top-n 5
```

---

## Input Structure

The script discovers all `summary.json` files anywhere under `--input-dir` via recursive glob.
Two directory layouts are supported:

```
# Old layout (single flat run per timestamp)
eval-results/
  2026-03-01_05-40-22/
    summary.json

# New layout (one folder per model × domain)
eval-results/
  gpt-4o/
    wikipedia/
      summary.json
      EVAL_001_wikipedia-python-year/
        agent-output.jsonl
        judge/attempt_1/  attempt_2/
        screenshots/
      errors/
    forms/
      summary.json
  claude-3-5-sonnet/
    wikipedia/
      summary.json
```

Each `summary.json` must contain at minimum: `model`, `results[]`. The `domain` field (written by `run-eval.ts`) is optional — files without it are grouped under `domain = "unknown"`.

---

## Generated Charts

All files are saved as `outputs/png/<name>.png` and `outputs/vector/<name>.pdf`.

| File                              | Chart                    | What it shows                                                                 |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `01_success_rate_comparison`      | Success Rate             | Pass % vs fail % per (model, domain), horizontal stacked bars                 |
| `02a_token_efficiency_input`      | Input Tokens             | Mean input tokens per task                                                    |
| `02b_token_efficiency_output`     | Output Tokens            | Mean output tokens per task                                                   |
| `02c_token_efficiency_total`      | Total Tokens             | Mean total tokens (input + output) per task                                   |
| `03_step_efficiency_distribution` | Step Efficiency          | Trajectory length distribution (box plot)                                     |
| `04_failure_analysis_breakdown`   | Failure Analysis         | Error categories per (model, domain), stacked bars                            |
| `05_time_metrics_distribution`    | Time Distribution        | Wall-clock time box plot + pass-conditioned mean (◆)                          |
| `06_model_comparison_heatmap`     | All-metrics Heatmap      | All metrics normalized 0–1; green=good for every column                       |
| `07_top_models_comparison`        | Top-N Heatmap            | Same as 06 but restricted to top-N series                                     |
| `08_domain_pass_rate_comparison`  | Domain × Model Pass Rate | Clustered bars: one group per domain, one bar per model                       |
| `09_domain_score_heatmap`         | Domain × Model Score     | Pivot heatmap rows=models, cols=domains, cell=avg score (skips if <2 domains) |
| `10_score_per_token`              | Score per Token          | Mean score ÷ (mean total tokens / 1k) — quality per cost                      |
| `11_speed_vs_score`               | Speed vs Score           | Scatter: x=mean time all tasks, y=pass rate                                   |
| `12_thrash_vs_score`              | Thrash vs Score          | Scatter: x=thrash ratio, y=pass rate                                          |
| `13_judge_keyword_concordance`    | Judge Concordance        | Scatter: keyword score vs judge score per task, with y=x reference            |
| `14_per_task_score_breakdown`     | Per-task Scores          | Grouped bars: score per task ID, one bar per (model, domain)                  |
| `15_error_category_by_domain`     | Errors by Domain         | Stacked bars: error category counts per domain (skips if only 1 domain)       |

Charts that require multi-domain data (`09`, `15`) print `[SKIP]` and continue cleanly when only one domain is present.

---

## Output Folders

```
outputs/
├── png/        # 300 DPI raster images (presentations, web)
├── vector/     # PDF vector graphics (LaTeX papers)
└── data/
    └── evaluation_summary.csv   # One row per (model, domain); importable into Excel
```

---

## Metric Notes

| Column                 | Meaning                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `mean_elapsed_sec_all` | Mean wall-clock time across **all** tasks (failed + passed). Used in charts and heatmap. |
| `mean_elapsed_sec`     | Mean wall-clock time for **passed tasks only** (success-conditioned speed).              |
| `mean_score`           | Mean of the final `score` field (average of keyword + judge scores, 0–100).              |
| `success_rate`         | `passed_tasks / total_tasks × 100`. Status `"pass"` requires score ≥ 80.                 |

Heatmap columns where **lower is better** (`tokens`, `elapsed`, `trajectory_length`, `thrash_ratio`) are displayed inverted so green = good consistently.

---

## Configuration

Edit `config.py` to adjust defaults:

```python
FIGURE_DPI_PNG = 300          # PNG resolution
FIGURE_DPI_PDF = 300          # PDF resolution
TOP_N_MODELS_DEFAULT = 10     # Default top-N limit
COLOR_PALETTE = [...]         # ColorBrewer Set2/Set3, colorblind-safe
USE_LATEX = False             # Disable LaTeX rendering (safe default)
```

---

## Using Charts in Papers

```latex
% LaTeX
\includegraphics[width=\textwidth]{eval/visualization/outputs/vector/01_success_rate_comparison.pdf}
```

```markdown
<!-- Markdown -->

![Success Rate](eval/visualization/outputs/png/01_success_rate_comparison.png)
```

---

## File Structure

```
eval/visualization/
├── generate_visualizations.py   # Entry point
├── config.py                    # DPI, fonts, colors, paths
├── requirements.txt             # Package list
├── README.md                    # This file
├── visualizers/
│   ├── __init__.py
│   ├── utils.py                 # save_figure, color palette, helpers
│   ├── success_rate.py          # Chart 01
│   ├── token_efficiency.py      # Charts 02a/b/c
│   ├── step_efficiency.py       # Chart 03
│   ├── failure_analysis.py      # Chart 04
│   ├── time_metrics.py          # Chart 05
│   ├── model_comparison.py      # Charts 06–07
│   ├── domain_comparison.py     # Charts 08–09
│   ├── score_efficiency.py      # Charts 10–12
│   └── judge_analysis.py        # Charts 13–15
└── outputs/
    ├── png/
    ├── vector/
    └── data/
```

---

## Troubleshooting

| Problem                                      | Fix                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ModuleNotFoundError: numpy._globals`        | Wrong venv active. Use `.\.venv\Scripts\python.exe` directly.                                             |
| `charmap codec` error loading a summary.json | Open the file in a text editor and re-save as UTF-8. The `output` field may contain non-ASCII characters. |
| Chart `[SKIP]`s unexpectedly                 | Single-domain or no-judge runs skip multi-domain and judge charts — this is normal.                       |
| LaTeX errors                                 | Ensure `config.py` has `USE_LATEX = False` (default).                                                     |
| Memory issues with 100+ models               | Use `--top-n 50` to limit series in dense charts.                                                         |
