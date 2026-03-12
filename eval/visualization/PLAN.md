# Audit & Improvement Plan

## 1. Currently Existing Charts

| #   | File                  | Output Name                       | Description                                                                    |
| --- | --------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `success_rate.py`     | `01_success_rate_comparison`      | Horizontal stacked bar: pass% vs fail% per model                               |
| 2a  | `token_efficiency.py` | `02a_token_efficiency_input`      | Horizontal bar: mean input tokens per task, per model                          |
| 2b  | `token_efficiency.py` | `02b_token_efficiency_output`     | Horizontal bar: mean output tokens per task, per model                         |
| 2c  | `token_efficiency.py` | `02c_token_efficiency_total`      | Horizontal bar: mean total tokens per task, per model                          |
| 3   | `step_efficiency.py`  | `03_step_efficiency_distribution` | Box plot: trajectory length distribution per model                             |
| 4   | `failure_analysis.py` | `04_failure_analysis_breakdown`   | Horizontal stacked bar: error categories per model                             |
| 5   | `time_metrics.py`     | `05_time_metrics_distribution`    | Box plot: elapsed time distribution with pass-conditioned mean diamond markers |
| 6   | `model_comparison.py` | `06_model_comparison_heatmap`     | Normalized metrics heatmap across all models                                   |
| 7   | `model_comparison.py` | `07_top_models_comparison`        | Same heatmap filtered to top-N models                                          |

---

## 2. Path Compatibility Audit

### 2.1 Structure Change

- **Old structure:** `eval-results/<timestamp>/summary.json` (flat, one run per timestamp)
- **New structure:** `eval-results/<model>/<domain>/summary.json`

The `rglob("summary.json")` at `generate_visualizations.py:58` still works — it finds all summary.json files regardless of depth. Path discovery is **not** broken.

### 2.2 Critical Semantic Bugs

#### Bug A — Multi-domain model key collision (Critical)

**Location:** `generate_visualizations.py:74`

```python
self.models_data[model_name] = {   # <-- KEY = model name only
    "summary": data,
    "run_dir": run_dir,
    "file_path": summary_file,
}
```

With the new structure a model like `gpt-4o` will have:

- `eval-results/gpt-4o/wikipedia/summary.json`
- `eval-results/gpt-4o/forms/summary.json`

The second load **silently overwrites the first**. All tasks from one domain are lost.

**Fix:** Use `(model_name, domain)` as key, or concatenate results across domains:

```python
key = f"{model_name}::{domain_name}"     # or merge results lists
```

**Exact lines to change:**

- `generate_visualizations.py:74` — change dict key from `model_name` to `f"{model_name}::{domain}"` where `domain = data.get("domain", "default")` (new field in `run-eval.ts:349`)
- `generate_visualizations.py:85` — update print statement
- `aggregate_metrics()` at `generate_visualizations.py:98` — update loop; the model column in the DataFrame should encode `model::domain` or be split into two columns

#### Bug B — Domain field not read (Medium)

`run-eval.ts:349` now writes `domain: domainName` into `summary.json`, but the Python never reads it. After fixing Bug A, the domain column becomes critical for per-domain breakdown charts.

---

## 3. Metric Correctness Audit

### Bug C — mean_elapsed_ms is pass-conditioned (Mislabeled)

**Location:** `generate_visualizations.py:136–137`

```python
if result.get("status") == "pass":
    all_elapsed_ms.append(result.get("elapsedMs", 0))
```

The resulting `mean_elapsed_ms` / `mean_elapsed_sec` is the **pass-conditioned mean** (matches TypeScript's `meanElapsedMsPassed`). The TS `meanElapsedMs` (all tasks) is never computed in Python. This causes the heatmap's `mean_elapsed_sec` column to favor models with fewer passes (less data = cherry-picked fast times).

**Fix:** Add a separate `all_elapsed_ms` loop that includes all tasks, and compute `mean_elapsed_ms_all`. Keep `mean_elapsed_ms` for the pass-conditioned value but rename or add the all-tasks variant. Update the heatmap to use `mean_elapsed_ms_all`.

**Exact lines:**

- `generate_visualizations.py:113–114` — add new list
- `generate_visualizations.py:136–137` — separate the two collections
- `generate_visualizations.py:188–194` — add `mean_elapsed_ms_all` row

### Bug D — Heatmap color inversion (High)

**Location:** `model_comparison.py:60–61`

`normalize_metrics` maps `(val - min) / (max - min)`. The `RdYlGn` colormap treats high normalized score (1.0) as green/good and low (0.0) as red/bad. But for metrics where **lower is better** (elapsed_sec, token counts, thrash_ratio), a high raw value produces a high normalized score — i.e., it shows green when it should show red.

**Affected columns in heatmap:** `mean_input_tokens`, `mean_output_tokens`, `mean_total_tokens`, `mean_elapsed_sec`, `thrash_ratio`

**Fix:** Apply `1 - normalize_metrics(...)` for these columns.

```python
LOWER_IS_BETTER = {
    "mean_input_tokens", "mean_output_tokens", "mean_total_tokens",
    "mean_elapsed_sec", "thrash_ratio"
}
for col in heatmap_data.columns:
    normed = normalize_metrics(heatmap_data[col].values)
    heatmap_data[col] = (1 - normed) if col in LOWER_IS_BETTER else normed
```

Same fix needed in `plot_top_models_radar()` at `model_comparison.py:148–149`.

### Bug E — Top-level analysis.time never read (Low)

The TS `aggregateRun()` now emits `analysis.time` (`meanElapsedMs`, `meanElapsedMsPassed`, `medianElapsedMs`, `iqrElapsedMs`) per `aggregates.ts:81–90`. Python's `aggregate_metrics()` ignores this and recomputes from scratch. This is fine for correctness today, but for future pre-aggregated data (e.g., if raw results are stripped), the Python should prefer reading from the top-level `analysis.time` block when per-task `elapsedMs` is available.

Not a bug today, but a fragility. **Recommendation:** Add a note / TODO.

### Bug F — toolCallCount not in old results (No fix needed)

`runner.ts:54` — `toolCallCount` is present in recent results, but old runs (pre-2026-03-01) don't have it. Python handles this gracefully at `generate_visualizations.py:160–162` with the `if tool_calls is not None` guard. No fix needed.

---

## 4. Missing Charts for Multi-Model / Multi-Domain

| Chart Name                                         | What It Shows                                                                                | Data Needed                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **A** Domain × Model pass-rate grid                | Side-by-side bar chart: for each domain, a cluster of bars (one per model) showing pass rate | domain field + per-task results grouped by (model, domain) |
| **B** Domain × Model avg score heatmap             | Heatmap rows=models, cols=domains, cell=avg score                                            | same                                                       |
| **C** Score per 1k tokens (token efficiency score) | Bar chart: `mean_score / (mean_total_tokens / 1000)` — quality per cost                      | score + `tokens.totalTokens` per task                      |
| **D** Speed vs. score scatter                      | Scatter: `x=mean_elapsed_sec`, `y=success_rate`, one point per (model, domain) bubble        | `elapsedMs` + score per task                               |
| **E** Thrash ratio vs. success rate                | Scatter: `x=thrash_ratio`, `y=success_rate`                                                  | `thrashing.thrashRatio` + status per task                  |
| **F** Per-task score breakdown                     | Grouped bar: per task ID, bars for `keyword_score` vs `judge_score` per model                | `keywordScore`, `judgeScore` per task                      |
| **G** Judge vs keyword score concordance           | Scatter: `x=keywordScore`, `y=judgeScore`, per task, colored by model                        | Same                                                       |
| **H** Error category trend by domain               | Stacked bar: for each domain, error category breakdown                                       | `analysis.error.category` + domain                         |

---

## 5. Complete Implementation Plan

### Phase 1 — Path & Structure Fixes

| Line(s)                             | Change                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `generate_visualizations.py:71–72`  | After reading `model_name`, also read `domain_name = data.get("domain", "unknown")`                                     |
| `generate_visualizations.py:74`     | Change key from `model_name` to `f"{model_name}::{domain_name}"`                                                        |
| `generate_visualizations.py:75–78`  | Add `"domain": domain_name` to the stored dict                                                                          |
| `generate_visualizations.py:80`     | Print `f"  [+] {model_name} / {domain_name}"`                                                                           |
| `generate_visualizations.py:85`     | Update log message                                                                                                      |
| `generate_visualizations.py:98–213` | In `aggregate_metrics()`, split model_key back to model and domain columns; add `"domain": domain_name` to the row dict |
| `generate_visualizations.py:232`    | Pass domain column to all visualizers that need per-domain breakdown                                                    |

### Phase 2 — Metric Bug Fixes

**generate_visualizations.py**

| Lines     | Change                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `113`     | Add `all_elapsed_ms_all = []` (all tasks, not just passed)                                                               |
| `128–138` | Append to `all_elapsed_ms_all` unconditionally; keep `all_elapsed_ms` (pass-only) for backwards compat                   |
| `188–194` | Add `"mean_elapsed_ms_all"`, `"mean_elapsed_sec_all"`, `"std_elapsed_sec_all"` fields computed from `all_elapsed_ms_all` |

**model_comparison.py**

| Lines     | Change                                                                    |
| --------- | ------------------------------------------------------------------------- |
| `29–38`   | Replace `mean_elapsed_sec` with `mean_elapsed_sec_all` in `metric_cols`   |
| `57–61`   | Add `LOWER_IS_BETTER` set; apply `1 - normed` for lower-is-better metrics |
| `145–149` | Same fix in `plot_top_models_radar()`                                     |

### Phase 3 — New Charts to Add

Create new files in `visualizers/`:

1. **`domain_comparison.py`** — `DomainComparisonVisualizer`
   - `plot_pass_rate_by_domain()` → `08_domain_pass_rate_comparison` (grouped bar)
   - `plot_score_heatmap()` → `09_domain_score_heatmap` (models × domains heatmap)
   - Data: takes `task_results_by_model_domain: Dict[str, Dict[str, List]]`

2. **`score_efficiency.py`** — `ScoreEfficiencyVisualizer`
   - `plot_score_per_token()` → `10_score_per_token` (bar: score/1k tokens)
   - `plot_speed_vs_score()` → `11_speed_vs_score` (scatter)
   - `plot_thrash_vs_score()` → `12_thrash_vs_score` (scatter)

3. **`judge_analysis.py`** — `JudgeAnalysisVisualizer`
   - `plot_keyword_vs_judge_concordance()` → `13_judge_keyword_concordance` (scatter)
   - `plot_per_task_scores()` → `14_per_task_score_breakdown` (grouped bar)

Add these to `visualizers/__init__.py` and call them in `generate_all_visualizations()` (`generate_visualizations.py:234–284`).

### Phase 4 — CLI Usage with New Structure

Current invocation works without change:

```bash
cd eval/visualization
uv run generate_visualizations.py
# or with explicit path:
uv run generate_visualizations.py --input-dir ../eval-results
# limit to top 5 models:
uv run generate_visualizations.py --top-n 5
```

After Bug A fix, also add `--model` and `--domain` filters:

```bash
uv run generate_visualizations.py --model "gpt-4o" --domain "wikipedia"
```

---

## Summary of Bugs

| ID  | File                         | Lines          | Severity     | Description                                                                |
| --- | ---------------------------- | -------------- | ------------ | -------------------------------------------------------------------------- |
| A   | `generate_visualizations.py` | 74             | **Critical** | Multi-domain runs from same model clobber each other in `models_data` dict |
| B   | `generate_visualizations.py` | 71–78          | **Medium**   | `domain` field never read; needed for per-domain charts                    |
| C   | `generate_visualizations.py` | 136–194        | **Medium**   | `mean_elapsed_ms` is pass-conditioned but labeled as if all-tasks          |
| D   | `model_comparison.py`        | 60–61, 148–149 | **High**     | Heatmap inverts "lower is better" metrics: high tokens/time shows as green |
| E   | All                          | —              | **Low**      | Top-level `analysis.time` block (from new TS aggregates) never consumed    |
| F   | `generate_visualizations.py` | 160–162        | **None**     | Gracefully handled with `if tool_calls is not None` guard                  |

---

## Notes

- Bug F requires no fix — it's handled gracefully.
- Bug E is a low-priority fragility; consider adding a TODO comment for future-proofing.
- After fixing Bug A, the CLI should support `--model` and `--domain` filters for better usability.
