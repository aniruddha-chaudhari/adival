#!/usr/bin/env python3
"""
Evaluation Results Visualization Script

Generates publication-quality visualizations from evaluation summary JSON files.
Supports multiple models and domains and creates comparative analysis charts.

Usage:
    python generate_visualizations.py
    python generate_visualizations.py --input-dir /path/to/eval-results --top-n 15
    python generate_visualizations.py --model gpt-4o --domain wikipedia
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd
import argparse
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from visualizers import (
    setup_matplotlib_style,
    create_output_dirs,
    SuccessRateVisualizer,
    TokenEfficiencyVisualizer,
    StepEfficiencyVisualizer,
    FailureAnalysisVisualizer,
    TimeMetricsVisualizer,
    ModelComparisonVisualizer,
    DomainComparisonVisualizer,
    ScoreEfficiencyVisualizer,
    JudgeAnalysisVisualizer,
    SuiteComparisonVisualizer,
)
import config

COMBINED_CONFIG_PATH = Path(__file__).parent / "visual-config.json"


class EvalResultsAggregator:
    """Aggregate evaluation results from multiple summary JSON files"""

    def __init__(self, eval_results_dir: Path = None):
        """
        Args:
            eval_results_dir: Path to eval-results directory
        """
        self.eval_dir = eval_results_dir or config.EVAL_RESULTS_DIR
        # Keyed by "model::domain" — prevents multi-domain collision (Bug A fix).
        self.models_data = {}
        self.aggregated_data = None

    def load_all_results(
        self,
        model_filter: str = None,
        domain_filter: str = None,
    ) -> bool:
        """Load all summary.json files from eval-results directory.

        Args:
            model_filter: Only load entries whose model name contains this string.
            domain_filter: Only load entries whose domain name contains this string.

        Returns:
            True if at least one file was loaded
        """
        print(f"\n[DIR] Loading evaluation results from: {self.eval_dir}")

        summary_files = list(self.eval_dir.rglob("summary.json"))

        if not summary_files:
            print("[ERROR] No summary.json files found")
            return False

        print(f"[STATS] Found {len(summary_files)} evaluation runs")

        for summary_file in summary_files:
            if "others" in summary_file.parts:
                continue
            try:
                with open(summary_file, "r") as f:
                    data = json.load(f)

                model_name = data.get("model", "unknown")
                # New runs (run-eval.ts >=2026-03) write domain; old runs omit it.
                domain_name = data.get("domain", "unknown")
                run_dir = data.get("runDir", str(summary_file.parent))

                # Apply optional filters
                if model_filter and model_filter not in model_name:
                    continue
                if domain_filter and domain_filter not in domain_name:
                    continue

                # Key by model::domain so multi-domain runs from the same model
                # don't overwrite each other (Bug A fix).
                key = f"{model_name}::{domain_name}"

                self.models_data[key] = {
                    "summary": data,
                    "model": model_name,
                    "domain": domain_name,
                    "run_dir": run_dir,
                    "file_path": summary_file,
                }

                print(f"  [+] {model_name} / {domain_name}")

            except Exception as e:
                print(f"  [-] Failed to load {summary_file}: {e}")

        print(f"\n[OK] Loaded {len(self.models_data)} unique (model, domain) runs")
        return len(self.models_data) > 0

    def aggregate_metrics(self) -> pd.DataFrame:
        """Aggregate metrics across all (model, domain) runs.

        Returns:
            DataFrame with one row per (model, domain) pair.
        """
        print("\n[CHART] Aggregating metrics...")

        aggregated = []

        for key, model_info in self.models_data.items():
            summary = model_info["summary"]
            results = summary.get("results", [])
            model_name = model_info["model"]
            domain_name = model_info["domain"]

            # Count task outcomes
            total_tasks = len(results)
            passed_tasks = len([r for r in results if r.get("status") == "pass"])
            partial_tasks = len([r for r in results if r.get("status") == "partial"])
            failed_tasks = total_tasks - passed_tasks - partial_tasks

            # Per-task accumulators
            all_input_tokens = []
            all_output_tokens = []
            all_total_tokens = []
            all_scores = []

            # Time data — two separate lists (Bug C fix):
            #   all_elapsed_ms_all   : every task  → maps to TS meanElapsedMs
            #   all_elapsed_ms_passed: passed tasks → maps to TS meanElapsedMsPassed
            all_elapsed_ms_all = []
            all_elapsed_ms_passed = []

            all_trajectory_lengths = []

            error_counts = {
                "none": 0,
                "comprehension": 0,
                "execution": 0,
                "resource": 0,
                "navigation": 0,
            }

            safety_scores = []
            thrash_ratios = []
            all_tool_call_counts = []

            for result in results:
                # Token data
                tokens = result.get("tokens") or {}
                all_input_tokens.append(tokens.get("inputTokens", 0))
                all_output_tokens.append(tokens.get("outputTokens", 0))
                all_total_tokens.append(tokens.get("totalTokens", 0))

                # Score
                all_scores.append(result.get("score", 0))

                # Time data — collect ALL tasks unconditionally (Bug C fix)
                elapsed = result.get("elapsedMs", 0)
                all_elapsed_ms_all.append(elapsed)
                if result.get("status") == "pass":
                    all_elapsed_ms_passed.append(elapsed)

                # Efficiency data
                result_analysis = result.get("analysis") or {}
                efficiency = result_analysis.get("efficiency", {})
                all_trajectory_lengths.append(efficiency.get("trajectoryLength", 0))

                # Error categories
                error_info = result_analysis.get("error", {})
                error_cat = error_info.get("category", "none")
                if error_cat in error_counts:
                    error_counts[error_cat] += 1

                # Safety
                safety = result_analysis.get("safety", {})
                safety_scores.append(safety.get("safetyScore", 100))

                # Thrashing
                thrashing = result_analysis.get("thrashing", {})
                thrash_ratio = thrashing.get("thrashRatio", 0)
                thrash_ratios.append(thrash_ratio)

                # Tool call count (from structured JSONL events)
                tool_calls = result.get("toolCallCount")
                if tool_calls is not None:
                    all_tool_call_counts.append(tool_calls)

            # Build row
            row = {
                "model": model_name,
                "domain": domain_name,
                "total_tasks": total_tasks,
                "passed_tasks": passed_tasks,
                "partial_tasks": partial_tasks,
                "failed_tasks": failed_tasks,
                "success_rate": (passed_tasks / total_tasks * 100)
                if total_tasks > 0
                else 0,
                "mean_score": np.mean(all_scores) if all_scores else 0,
                # Token stats
                "mean_input_tokens": np.mean(all_input_tokens)
                if all_input_tokens
                else 0,
                "std_input_tokens": np.std(all_input_tokens) if all_input_tokens else 0,
                "mean_output_tokens": np.mean(all_output_tokens)
                if all_output_tokens
                else 0,
                "std_output_tokens": np.std(all_output_tokens)
                if all_output_tokens
                else 0,
                "mean_total_tokens": np.mean(all_total_tokens)
                if all_total_tokens
                else 0,
                "std_total_tokens": np.std(all_total_tokens) if all_total_tokens else 0,
                # All-tasks elapsed — matches TS meanElapsedMs (Bug C fix)
                "mean_elapsed_ms_all": np.mean(all_elapsed_ms_all)
                if all_elapsed_ms_all
                else 0,
                "mean_elapsed_sec_all": np.mean(all_elapsed_ms_all) / 1000
                if all_elapsed_ms_all
                else 0,
                "std_elapsed_sec_all": np.std(np.array(all_elapsed_ms_all) / 1000)
                if all_elapsed_ms_all
                else 0,
                # Pass-conditioned elapsed — matches TS meanElapsedMsPassed
                "mean_elapsed_ms_passed": np.mean(all_elapsed_ms_passed)
                if all_elapsed_ms_passed
                else 0,
                "mean_elapsed_sec": np.mean(all_elapsed_ms_passed) / 1000
                if all_elapsed_ms_passed
                else 0,
                "std_elapsed_sec": np.std(np.array(all_elapsed_ms_passed) / 1000)
                if all_elapsed_ms_passed
                else 0,
                "mean_trajectory_length": np.mean(all_trajectory_lengths)
                if all_trajectory_lengths
                else 0,
                "std_trajectory_length": np.std(all_trajectory_lengths)
                if all_trajectory_lengths
                else 0,
                "error_none": error_counts["none"],
                "error_comprehension": error_counts["comprehension"],
                "error_execution": error_counts["execution"],
                "error_resource": error_counts["resource"],
                "error_navigation": error_counts["navigation"],
                "safety_score": np.mean(safety_scores) if safety_scores else 100,
                "thrash_ratio": np.mean(thrash_ratios) if thrash_ratios else 0,
                "mean_tool_call_count": np.mean(all_tool_call_counts)
                if all_tool_call_counts
                else 0,
            }

            aggregated.append(row)

        self.aggregated_data = pd.DataFrame(aggregated)

        print(
            f"[OK] Aggregated metrics for {len(self.aggregated_data)} (model, domain) runs"
        )

        return self.aggregated_data

    def get_task_results_by_model(self) -> Dict[str, List]:
        """Get raw task results organized by 'model::domain' key.

        Returns:
            Dict mapping "model::domain" string to list of task result dicts.
        """
        task_results = {}
        for key, model_info in self.models_data.items():
            summary = model_info["summary"]
            task_results[key] = summary.get("results", [])
        return task_results


def _filter_target_models(
    aggregated_data: pd.DataFrame, task_results_by_model: Dict[str, List]
) -> Tuple[pd.DataFrame, Dict[str, List]]:
    """Filter results down to target models only."""
    target_models = set(config.TARGET_MODELS)
    filtered_agg = aggregated_data[aggregated_data["model"].isin(target_models)].copy()
    filtered_tasks = {
        key: results
        for key, results in task_results_by_model.items()
        if key.split("::", 1)[0] in target_models
    }
    return filtered_agg, filtered_tasks


def generate_per_suite_visualizations(
    aggregated_data: pd.DataFrame,
    task_results_by_model: Dict[str, List],
    top_n_models: int = None,
):
    """Generate per-suite visualizations only.

    Args:
        aggregated_data: Aggregated metrics DataFrame (one row per model::domain)
        task_results_by_model: Raw task results keyed by "model::domain"
        top_n_models: Limit visualizations to top N series (optional)
    """

    print("\n[STATS] Generating per-suite visualizations...")
    print("=" * 60)

    aggregated_data, task_results_by_model = _filter_target_models(
        aggregated_data, task_results_by_model
    )

    # 1. Success Rate
    print("\n[1]  Success Rate Comparison")
    sr_viz = SuccessRateVisualizer(aggregated_data)
    sr_viz.plot(top_n=top_n_models, per_suite=True)

    # 2. Token Efficiency
    print("\n[2]  Token Efficiency")
    te_viz = TokenEfficiencyVisualizer(aggregated_data)
    te_viz.plot_input_tokens(top_n=top_n_models, per_suite=True)
    te_viz.plot_output_tokens(top_n=top_n_models, per_suite=True)
    te_viz.plot_total_tokens(top_n=top_n_models, per_suite=True)

    # 3. Step Efficiency
    print("\n[3]  Step Efficiency Distribution")
    se_viz = StepEfficiencyVisualizer(task_results_by_model)
    se_viz.plot_distribution(top_n=top_n_models, per_suite=True)

    # 4. Failure Analysis
    print("\n[4]  Failure Analysis")
    fa_viz = FailureAnalysisVisualizer(aggregated_data)
    fa_viz.plot_failure_breakdown(top_n=top_n_models, per_suite=True)

    # 5. Time Metrics
    print("\n[5]  Time-to-Success Distribution")
    tm_viz = TimeMetricsVisualizer(task_results_by_model)
    tm_viz.plot_distribution(top_n=top_n_models, per_suite=True)

    # 6. Model Comparison
    print("\n[6]  Model Comparison Heatmaps")
    mc_viz = ModelComparisonVisualizer(aggregated_data)
    mc_viz.plot_heatmap(top_n=top_n_models, per_suite=True)

    # 9. Judge Analysis (per-suite only)
    print("\n[9]  Judge Analysis (Per-Suite)")
    ja_viz = JudgeAnalysisVisualizer(task_results_by_model)
    ja_viz.plot_per_task_scores()

    print("\n" + "=" * 60)
    print("[OK] Per-suite visualizations generated successfully!\n")


def generate_combined_visualizations(
    aggregated_data: pd.DataFrame,
    task_results_by_model: Dict[str, List],
    combined_name: str,
    combined_domains: List[str],
    top_n_models: int = None,
):
    """Generate combined-domain visualizations (7-21) for configured domains."""

    print("\n[COMBINED] Generating combined visualizations...")
    print("=" * 60)

    aggregated_data, task_results_by_model = _filter_target_models(
        aggregated_data, task_results_by_model
    )

    domain_set = set(combined_domains)
    combined_agg = aggregated_data[aggregated_data["domain"].isin(domain_set)].copy()
    combined_tasks = {
        key: results
        for key, results in task_results_by_model.items()
        if key.split("::", 1)[1] in domain_set
    }

    if combined_agg.empty:
        print("[SKIP] Combined visualizations: no matching domains found")
        return

    combined_subdir = f"combined/{combined_name}"

    # 7. Top Models Comparison
    print("\n[7]  Top Models Comparison (Combined)")
    mc_viz = ModelComparisonVisualizer(combined_agg)
    mc_viz.plot_top_models_radar(
        top_n=min(10, len(combined_agg)), output_subdir=combined_subdir
    )

    # 8. Domain × Model Comparison
    print("\n[8]  Domain × Model Comparison (Combined)")
    dc_viz = DomainComparisonVisualizer(combined_agg)
    dc_viz.plot_pass_rate_by_domain(output_subdir=combined_subdir)
    dc_viz.plot_score_heatmap(output_subdir=combined_subdir)

    # 9. Score Efficiency
    print("\n[9]  Score Efficiency (Combined)")
    se2_viz = ScoreEfficiencyVisualizer(combined_agg, combined_tasks)
    se2_viz.plot_score_per_token(output_subdir=combined_subdir)
    se2_viz.plot_speed_vs_score(output_subdir=combined_subdir)
    se2_viz.plot_thrash_vs_score(output_subdir=combined_subdir)

    # 10. Judge Analysis
    print("\n[10] Judge Analysis (Combined)")
    ja_viz = JudgeAnalysisVisualizer(combined_tasks)
    ja_viz.plot_keyword_vs_judge_concordance(output_subdir=combined_subdir)
    ja_viz.plot_error_category_by_domain(output_subdir=combined_subdir)

    # 11. Suite Comparison (configured domains)
    print("\n[11] Suite Comparison (Combined)")
    sc_viz = SuiteComparisonVisualizer(
        combined_agg,
        combined_tasks,
        suite_order=combined_domains,
        suite_labels={d: d for d in combined_domains},
    )
    sc_viz.plot_all(output_subdir=combined_subdir, data_subdir=combined_subdir)

    print("\n" + "=" * 60)
    print("[OK] Combined visualizations generated successfully!\n")


def load_combined_config(config_path: Path) -> List[Tuple[str, List[str]]]:
    """Load combined visualization config.

    Supported formats:
    1) {"combined": {"name": "...", "domains": [...]}}
    2) {"combined": [{"name": "...", "domains": [...]}, ...]}
    """
    if not config_path.exists():
        raise FileNotFoundError(f"Combined config not found: {config_path}")

    data = json.loads(config_path.read_text(encoding="utf-8"))
    combined = data.get("combined")
    if combined is None:
        raise ValueError("Missing 'combined' in visual-config.json")

    combined_entries = combined if isinstance(combined, list) else [combined]
    parsed: List[Tuple[str, List[str]]] = []

    for i, entry in enumerate(combined_entries, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"combined[{i}] must be an object")

        name = entry.get("name")
        domains = entry.get("domains")

        if not name or not isinstance(name, str):
            raise ValueError(f"combined[{i}].name must be a non-empty string")
        if not isinstance(domains, list) or not all(
            isinstance(d, str) and d.strip() for d in domains
        ):
            raise ValueError(f"combined[{i}].domains must be a list of strings")

        parsed.append((name, domains))

    return parsed


def save_summary_table(aggregated_data: pd.DataFrame):
    """Save aggregated metrics to CSV for paper tables"""

    print("\n[TABLE] Saving summary table...")

    # Select key metrics for summary
    summary_cols = [
        "model",
        "domain",
        "total_tasks",
        "passed_tasks",
        "success_rate",
        "mean_score",
        "mean_input_tokens",
        "mean_output_tokens",
        "mean_total_tokens",
        "mean_elapsed_sec_all",
        "mean_elapsed_sec",
        "mean_trajectory_length",
        "mean_tool_call_count",
        "safety_score",
        "thrash_ratio",
    ]

    available_cols = [col for col in summary_cols if col in aggregated_data.columns]
    summary_df = aggregated_data[available_cols].copy()

    # Sort by success rate descending
    summary_df = summary_df.sort_values("success_rate", ascending=False)

    # Save to CSV
    csv_path = config.DATA_DIR / "evaluation_summary.csv"
    summary_df.to_csv(csv_path, index=False)

    print(f"[+] Summary table saved: {csv_path}")

    # Also save as formatted table for easy copying to papers
    print("\n[STATS] Summary Table (for paper):")
    print("-" * 120)
    print(summary_df.to_string(index=False))
    print("-" * 120)


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(
        description="Generate publication-quality visualizations from evaluation results"
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=config.EVAL_RESULTS_DIR,
        help="Path to eval-results directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=config.OUTPUT_DIR,
        help="Path to output directory",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=None,
        help="Limit visualizations to top N (model, domain) series (by success rate)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Filter: only load runs whose model name contains this string",
    )
    parser.add_argument(
        "--domain",
        type=str,
        default=None,
        help="Filter: only load runs whose domain name contains this string",
    )

    args = parser.parse_args()

    # Setup
    print("\n" + "=" * 60)
    print("[*] Evaluation Results Visualization Tool")
    print("=" * 60)

    create_output_dirs()
    setup_matplotlib_style()

    # Load results
    aggregator = EvalResultsAggregator(args.input_dir)
    if not aggregator.load_all_results(
        model_filter=args.model,
        domain_filter=args.domain,
    ):
        print("[ERROR] No evaluation results found. Exiting.")
        return 1

    # Aggregate metrics
    aggregated_data = aggregator.aggregate_metrics()
    task_results_by_model = aggregator.get_task_results_by_model()

    # Generate per-suite visualizations
    generate_per_suite_visualizations(
        aggregated_data, task_results_by_model, top_n_models=args.top_n
    )

    # Generate combined visualizations (7-21) from config
    for combined_name, combined_domains in load_combined_config(COMBINED_CONFIG_PATH):
        generate_combined_visualizations(
            aggregated_data,
            task_results_by_model,
            combined_name=combined_name,
            combined_domains=combined_domains,
            top_n_models=args.top_n,
        )

    # Save summary table
    save_summary_table(aggregated_data)

    print(f"[OUTPUT] Output saved to:")
    print(f"   PNG:  {config.PNG_DIR}")
    print(f"   PDF:  {config.VECTOR_DIR}")
    print(f"   CSV:  {config.DATA_DIR}")

    print("\n[SUCCESS] Done! Ready for publication. [SUCCESS]\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
