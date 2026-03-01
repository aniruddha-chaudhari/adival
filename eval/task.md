**User:**

what are the standard evaluations metrics that i should measure for my task
i want to publish my findings, so what metrics should i measure and track

---

Based on my exploration of the OpenAI Evals library and industry standards for agent evaluation, here's a comprehensive guide to **metrics you should measure and track for publishing browser-using agent evals**:

## Core Metrics (Essential for Publication)

## Shir Anirudha Maharaj sanstha

### 1. **Task Success Rate** (Outcome / Black Box)

- **What**: Percentage of tasks completed successfully (0/1 binary)
- **Why**: Primary metric that directly answers "does the agent work?"
- **How to calculate**: `(successful_tasks / total_tasks) × 100`
- **Example**: 8/9 tasks = 89% success rate

### 2. **Accuracy / Correctness**

- **What**: Whether the final answer/action was correct
- **Why**: Some tasks may complete but with wrong results
- **Why**: Compares intelligence vs cost.
- **Variants**:
  - Exact match (binary correct/incorrect)
  - Fuzzy match (partial credit if close to target)
  - Token-level accuracy (for generated answers)

### 4. **Token/Cost Efficiency, Latency**

- **Input tokens**: Prompt tokens per task
- **Output tokens**: Generated tokens per task
- **Total cost**: Estimated API cost per successful task
- **What**: Token usage, API cost, response time.
- **How**: Track `input_tokens`, `output_tokens`, multiply by pricing.
- **Example**: 90% success at 1/50th cost
- **Why**: Critical for evaluating practical feasibility across models

### 8. **Model Comparison Metrics**

- **Win rate**: Model A vs Model B (head-to-head)
- **Relative improvement**: (Model_B - Model_A) / Model_A × 100%
- **Rank by metric**: Overall leaderboard across models

### 11. **Time-to-Success**

- Wall-clock time per task
- Useful for real-world deployment considerations

### 12. **Robustness Metrics**

- Same task with variations (different websites, UI changes), measure success variance
- Success rate reliability on out-of-distribution tasks
- Recovery from errors (error recovery eval)
- **Example**: 5/5 vs 3/5 runs

---

## Aditya

### 3. **Action/Step Efficiency**

- **Trajectory length**: Number of steps/actions taken, Wrong unnecessary steps taken
- **Ideal**: Fewer steps = more efficient agent
- **Calculate**:
  - Mean steps per successful task
  - Standard error (SEM) of steps
  - Comparison to human baseline

```python
avg_steps = len(successful_trajectories) / num_successful
sem_steps = np.std(steps) / np.sqrt(len(steps))
```

### 10. **Error Analysis Metrics**

- **Failure rate by category**:
  - Failed to understand task (comprehension)
  - Incorrect tool usage (execution)
  - Timeout/context window (resource)
  - Navigation errors (browser control)
- **Most common failure mode**: Helps readers understand limitations

### 13. **Safety/Security Metrics**

- Did agent attempt harmful actions?
- Compliance with constraints?
- **How**: Judge model + JSON rubric (0–100).
- **Example**: Score 85/100, risky command attempted → fail

### 17. Command Thrashing

- **What**: Redundant commands.
- **Why**: High repetition = poor planning.
- **How**: `(redundant_commands / total_commands)`
- **Example**: 3 repeats/10 commands = 30% thrash

## Statistical Metrics (For Credible Publication)

### 5. **Confidence/Reliability Metrics**

| Metric                      | Definition               | Why                                    |
| --------------------------- | ------------------------ | -------------------------------------- |
| **Standard Error (SEM)**    | `std / sqrt(n)`          | Shows reliability of mean success rate |
| **95% Confidence Interval** | Mean ± 1.96×SEM          | Publishable interval estimate          |
| **Sample Size (N)**         | Total eval samples       | Larger = more credible                 |
| **Variance per difficulty** | Split by task difficulty | Shows where agent struggles            |

### 9. **Difficulty-Based Breakdown**

Group metrics by task difficulty:

```python
{
  "easy_success_rate": 0.95,
  "medium_success_rate": 0.70,
  "hard_success_rate": 0.45,
  "avg_steps_easy": 5.2,
  "avg_steps_medium": 12.1,
  "avg_steps_hard": 28.3
}
```

---

## Publishing Checklist

- [ ] Success rate (binary task completion)
- [ ] Token counts and estimated cost
- [ ] Step efficiency + statistical error bars
- [ ] Breakdown by task difficulty
- [ ] Human baseline comparison (if available)
- [ ] Failure analysis (why did it fail?)
- [ ] Reproducibility (sample size, confidence intervals, seeds)
- [ ] Comparison vs other models (if applicable)

---

> Review Later

## Recommended Minimum Set for Publication

Create a table like this in your paper:

| Model    | Tasks | Success Rate | Avg Steps  | Tokens/Task | Confidence (95% CI) |
| -------- | ----- | ------------ | ---------- | ----------- | ------------------- |
| GPT-4    | 9     | 89%          | 12.3 ± 2.1 | 8,420       | [0.73, 0.97]        |
| Claude 3 | 9     | 78%          | 15.1 ± 3.2 | 7,890       | [0.58, 0.91]        |
| Gemini   | 9     | 56%          | 18.9 ± 4.5 | 6,200       | [0.32, 0.78]        |

### 6. **Stability Metrics** (Important for Reproducibility)

- **Consistency**: Same task, run multiple times
  - If success rate = 100%, always succeeds
  - If success rate = 50%, succeeds ~half the time
- **Solved-if-any-solved ratio**: Stability measure (1.0 = always succeeds)

### 7. **Human-Relative Performance** (Best for Publication)

```
Score = (Model_Performance - Baseline) / (Human_Performance - Baseline)
- 0% = naive baseline (no capability)
- 100% = human expert level
- 200% = 2× human performance
```

---

## 📋 Future Implementation Notes

### Statistical Significance Testing (TODO)
**Currently Skipped**: Visualization system is ready but statistical significance testing needs implementation.

**Implementation Plan**:
- Use **Mann-Whitney U test** for pairwise model comparisons (non-parametric, robust)
- Display significance stars on charts:
  - `***` for p < 0.001
  - `**` for p < 0.01
  - `*` for p < 0.05
  - `ns` for p ≥ 0.05
- Compare each model against:
  - Baseline model (best performer)
  - Or all pairwise comparisons (if needed for paper)
- Add significance annotations to bar charts and heatmaps

**Recommended Approach**:
```python
from scipy import stats

# Mann-Whitney U test
stat, p_value = stats.mannwhitneyu(model_a_results, model_b_results, alternative='two-sided')

# Bonferroni correction for multiple comparisons
bonferroni_alpha = 0.05 / num_comparisons
```

**Reference**: See [scipy.stats.mannwhitneyu](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html)

---

### Task Difficulty Measurement (TODO)
**Currently Skipped**: Difficulty-based breakdown visualization not yet implemented.

**Implementation Plan** (Performance-Based Approach - Recommended):
- After aggregating all model results, compute per-task success rate
- Categorize tasks based on aggregate success rate across all models:
  - **Easy**: ≥80% of models succeed
  - **Medium**: 40-80% of models succeed
  - **Hard**: <40% of models succeed

**Alternative Approach** (Intrinsic Complexity):
- Manual tagging of tasks at eval definition
- Or use metrics like:
  - Number of required steps (5+ steps = harder)
  - Number of page interactions needed
  - Dynamic content complexity

**Integration with Visualizations**:
- Create grouped bar charts: success rate broken down by (model, difficulty)
- Box plots showing step efficiency by difficulty level
- Heatmap with difficulty as secondary dimension
- Separate tables for easy/medium/hard tasks in paper appendix

**Note**: Difficulty measurement is intrinsically relative—same task may be "hard" for one model class and "easy" for another. The performance-based approach captures this relativity.
