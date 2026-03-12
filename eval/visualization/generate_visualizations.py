#!/usr/bin/env python3
"""
Evaluation Results Visualization Script

Generates publication-quality visualizations from evaluation summary JSON files.
Supports multiple models and creates comparative analysis charts.

Usage:
    python generate_visualizations.py
    python generate_visualizations.py --input-dir /path/to/eval-results --top-n 15
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
)
import config


class EvalResultsAggregator:
    """Aggregate evaluation results from multiple summary JSON files"""

    def __init__(self, eval_results_dir: Path = None):
        """
        Args:
            eval_results_dir: Path to eval-results directory
        """
        self.eval_dir = eval_results_dir or config.EVAL_RESULTS_DIR
        self.models_data = {}
        self.aggregated_data = None

    def load_all_results(self) -> bool:
        """Load all summary.json files from eval-results directory

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
            try:
                with open(summary_file, "r") as f:
                    data = json.load(f)

                model_name = data.get("model", "unknown")
                run_dir = data.get("runDir", str(summary_file.parent))

                self.models_data[model_name] = {
                    "summary": data,
                    "run_dir": run_dir,
                    "file_path": summary_file,
                }

                print(f"  [+] {model_name}")

            except Exception as e:
                print(f"  [-] Failed to load {summary_file}: {e}")

        print(f"\n[OK] Loaded {len(self.models_data)} unique models")
        return len(self.models_data) > 0

    def aggregate_metrics(self) -> pd.DataFrame:
        """Aggregate metrics across all models

        Returns:
            DataFrame with aggregated metrics per model
        """
        print("\n[CHART] Aggregating metrics...")

        aggregated = []

        for model_name, model_info in self.models_data.items():
            summary = model_info["summary"]
            results = summary.get("results", [])
            analysis = summary.get("analysis", {})

            # Count task outcomes
            total_tasks = len(results)
            passed_tasks = len([r for r in results if r.get("status") == "pass"])
            partial_tasks = len([r for r in results if r.get("status") == "partial"])
            failed_tasks = total_tasks - passed_tasks - partial_tasks

            # Token statistics
            all_input_tokens = []
            all_output_tokens = []
            all_total_tokens = []
            all_elapsed_ms = []
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

                # Time data (passed tasks only — failed/errored time is not meaningful)
                if result.get("status") == "pass":
                    all_elapsed_ms.append(result.get("elapsedMs", 0))

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

            # Compute statistics
            row = {
                "model": model_name,
                "total_tasks": total_tasks,
                "passed_tasks": passed_tasks,
                "partial_tasks": partial_tasks,
                "failed_tasks": failed_tasks,
                "success_rate": (passed_tasks / total_tasks * 100)
                if total_tasks > 0
                else 0,
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
                "mean_elapsed_ms": np.mean(all_elapsed_ms) if all_elapsed_ms else 0,
                "mean_elapsed_sec": np.mean(all_elapsed_ms) / 1000
                if all_elapsed_ms
                else 0,
                "std_elapsed_sec": np.std(np.array(all_elapsed_ms) / 1000)
                if all_elapsed_ms
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

        print(f"[OK] Aggregated metrics for {len(self.aggregated_data)} models")

        return self.aggregated_data

    def get_task_results_by_model(self) -> Dict[str, List]:
        """Get raw task results organized by model

        Returns:
            Dict mapping model name to list of task results
        """
        task_results = {}
        for model_name, model_info in self.models_data.items():
            summary = model_info["summary"]
            task_results[model_name] = summary.get("results", [])
        return task_results


def generate_all_visualizations(
    aggregated_data: pd.DataFrame,
    task_results_by_model: Dict[str, List],
    top_n_models: int = None,
):
    """Generate all visualization types

    Args:
        aggregated_data: Aggregated metrics DataFrame
        task_results_by_model: Raw task results by model
        top_n_models: Limit visualizations to top N models (optional)
    """

    print("\n[STATS] Generating visualizations...")
    print("=" * 60)

    # 1. Success Rate
    print("\n[1]  Success Rate Comparison")
    sr_viz = SuccessRateVisualizer(aggregated_data)
    sr_viz.plot(top_n=top_n_models)

    # 2. Token Efficiency
    print("\n[2]  Token Efficiency")
    te_viz = TokenEfficiencyVisualizer(aggregated_data)
    te_viz.plot_input_tokens(top_n=top_n_models)
    te_viz.plot_output_tokens(top_n=top_n_models)
    te_viz.plot_total_tokens(top_n=top_n_models)

    # 3. Step Efficiency
    print("\n[3]  Step Efficiency Distribution")
    se_viz = StepEfficiencyVisualizer(task_results_by_model)
    se_viz.plot_distribution(top_n=top_n_models)

    # 4. Failure Analysis
    print("\n[4]  Failure Analysis")
    fa_viz = FailureAnalysisVisualizer(aggregated_data)
    fa_viz.plot_failure_breakdown(top_n=top_n_models)

    # 5. Time Metrics
    print("\n[5]  Time-to-Success Distribution")
    tm_viz = TimeMetricsVisualizer(task_results_by_model)
    tm_viz.plot_distribution(top_n=top_n_models)

    # 6. Model Comparison
    print("\n[6]  Model Comparison Heatmaps")
    mc_viz = ModelComparisonVisualizer(aggregated_data)
    mc_viz.plot_heatmap(top_n=top_n_models)
    mc_viz.plot_top_models_radar(top_n=min(10, len(aggregated_data)))

    print("\n" + "=" * 60)
    print("[OK] All visualizations generated successfully!\n")


def save_summary_table(aggregated_data: pd.DataFrame):
    """Save aggregated metrics to CSV for paper tables"""

    print("\n[TABLE] Saving summary table...")

    # Select key metrics for summary
    summary_cols = [
        "model",
        "total_tasks",
        "passed_tasks",
        "success_rate",
        "mean_input_tokens",
        "mean_output_tokens",
        "mean_total_tokens",
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
        help="Limit visualizations to top N models (by success rate)",
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
    if not aggregator.load_all_results():
        print("[ERROR] No evaluation results found. Exiting.")
        return 1

    # Aggregate metrics
    aggregated_data = aggregator.aggregate_metrics()
    task_results_by_model = aggregator.get_task_results_by_model()

    # Generate visualizations
    generate_all_visualizations(
        aggregated_data, task_results_by_model, top_n_models=args.top_n
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
