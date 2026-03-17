# Executive Summary

We surveyed public resources of ready-made **office-file tasks** (input files) with corresponding answer/verification data, suitable for testing AI agents or training users. We identified five representative packages across diverse domains: multi-application Office workflows, Excel, PowerPoint, PDF, and email/text summarization. For each, we detail source links, license, file types, task descriptions, dataset size, sample count, answers/annotations, and access instructions. We also propose a curated 5-file test bundle (one per domain) with download plan, and an evaluation guide (metrics, rubrics, automation tips). Finally, a comparison table contrasts the top 10 candidate resources by relevance and completeness. All sources are cited from official pages or papers.

## 1. Office Automation Tasks (Word/Excel/Email) – **OfficeBench**

- **Source:** OfficeBench Benchmark – GitHub (primary)【27†L287-L295】.
- **URL:** [github.com/zlwang-cs/OfficeBench](https://github.com/zlwang-cs/OfficeBench) (Apache-2.0)【27†L409-L412】.
- **Files:** JSON task definitions (instructions), optional automation scripts. (No bundled document files).
- **Tasks:** Multi-step workflows in common apps (e.g. Word, Excel, Outlook): e.g. “open a template, fill fields, send email” or “apply formulas and charts”【27†L287-L295】. Contains sub-tasks with evaluation scripts.
- **Size:** ~300 tasks across 5 applications (Word, Excel, Outlook, Chrome, PowerPoint, Gmail). Total JSON config size ~MB.
- **Samples:** ~60 Word tasks, ~60 Excel tasks, plus email sending, web navigation tasks. See [OfficeBench](https://github.com/zlwang-cs/OfficeBench/tree/main/tasks).
- **Answers:** Annotation available via scriptable “expected result” checks (e.g. cell values, file existence) defined in each task’s JSON【27†L287-L295】. No human-written answer docs, but evaluation code and expected values are provided.
- **Difficulty:** Ranges Beginner–Advanced (labeled in JSON, with compound multi-step flows).
- **Download:** `git clone https://github.com/zlwang-cs/OfficeBench.git`. No login required. (License Apache-2.0).
- **Access:** Open on GitHub. Tasks and evaluation code are public; no restrictions.

## 2. Excel Tasks – **GoSkills Excel Challenge** _(community)_

- **Source:** GoSkills Excel Challenge Repository – GitHub (user-contributed).
- **URL:** [github.com/Gbekoilias/Go-Skills-Excel-Challenge](https://github.com/Gbekoilias/Go-Skills-Excel-Challenge) (no license declared).
- **Files:** Each “Challenge” folder contains an `.xlsx` data file and a README with problem statement and the author’s solution steps.
- **Tasks:** Realistic Excel problems (data analysis, formulas, charts). E.g. “calculate metrics, create pivot chart, apply conditional formatting”【63†L373-L382】.
- **Size:** 34 challenges in repo. Total ~34× (data file + readme). Data sizes vary (0.1–1 MB each).
- **Samples:** Many sample .xlsx files and solutions (user-submitted). For example, _Challenge1/challenge1.xlsx_ (with simple stats questions)【63†L395-L404】.
- **Answers:** Included in README text (step-by-step) and via example spreadsheets (solved answers). No formal keys beyond user solutions.
- **Difficulty:** Graded 1–5 stars (beginner to advanced)【63†L372-L381】.
- **Download:** `git clone https://github.com/Gbekoilias/Go-Skills-Excel-Challenge.git`. (No official license; use under fair-use).
- **Access:** Public repo; no login. Note: Not “official”, but easily accessible exercise set.

## 3. PowerPoint Editing – **PPTArena**

- **Source:** _PPTArena_ – Cornell University (Ofengenden et al. 2025)【42†L290-L299】.
- **URL:** [github.com/michaelofengend/PPTArena](https://github.com/michaelofengend/PPTArena) (MIT License shown【42†L288-L292】).
- **Files:** 100 “Original” PowerPoint decks (.pptx) and 100 corresponding “Ground Truth” decks, totalling ~200 PPTX files【42†L329-L334】. Also Python evaluation scripts.
- **Tasks:** In-place slide edits under natural-language instructions (e.g. “change chart type”, “add slide”, “modify master style”). Covers text, charts, tables, layouts【42†L294-L299】.
- **Size:** ~2125 slides across decks【83†L1-L4】. Roughly 100 PPTX, ~300–400 KB each (tens of MB total).
- **Samples:** Examples include _AddAgendaSlide.pptx_ (original and ground truth). (See GitHub [Original/](https://github.com/michaelofengend/PPTArena/tree/main/Original) and [GroundTruth/](https://github.com/michaelofengend/PPTArena/tree/main/GroundTruth)).
- **Answers:** Ground-truth .pptx decks serve as answer keys for each task【42†L327-L334】. (Evaluation pipeline compares agent output to these via visual and structural diff).
- **Difficulty:** Intermediate–Advanced (complex layout edits, multi-slide consistency)【42†L294-L299】.
- **Download:** Clone repo: `git clone https://github.com/michaelofengend/PPTArena.git`. (MIT license).
- **Access:** Public on GitHub; no credentials needed.

## 4. PDF Form Filling – **WorldGUI (Acrobat Tasks)**

- **Source:** _WorldGUI-Bench_ – Zhao et al. 2025【85†L106-L114】.
- **URL:** [huggingface.co/datasets/hhenryz/WorldGUI-Bench](https://huggingface.co/datasets/hhenryz/WorldGUI-Bench) (Apache-2.0)【85†L38-L40】. Also GitHub [WorldGUI project](https://github.com/hhenryz/worldgui) and arXiv.
- **Files:** PDF task files and metadata JSON. Example: “project.pdf” (Adobe Acrobat) with given instructions. The dataset provides the PDF, an instructional video, and a step-by-step ground-truth plan【85†L106-L114】.
- **Tasks:** GUI automation tasks in desktop apps. Our focus: the Adobe Acrobat “Edit PDF” tasks (category _Office_). E.g. _“Edit PDF by removing selected text ‘College of Design and Engineering’.”_【85†L106-L115】. Agents must locate text and modify PDF.
- **Size:** WorldGUI contains ~300 tasks (various apps). PDF-specific tasks are a subset. Example project file _adobeacrobat_00/project.pdf_ (~hundreds of KB). Full dataset size tens of MB.
- **Samples:** At least one PDF task per Acrobat project. Example shown in HuggingFace card: project file path “AdobeAcrobat/adobeacrobat_00/project.pdf”, with question and step-by-step ground-truth plan【85†L106-L114】.
- **Answers:** “Ground-Truth Plan” (sequence of edit steps) is provided【85†L106-L114】. Also includes the final modified PDF for verification.
- **Difficulty:** Mixed; tasks are labeled _simple_ or _hard_ in metadata (e.g. add extra scrolling)【85†L138-L147】. The example above is “simple” (4 steps)【85†L123-L124】.
- **Download:** Use HuggingFace: `pip install huggingface_hub` then `hf_api dataset_download hhenryz/WorldGUI-Bench`. Alternatively, clone [GitHub](https://github.com/hhenryz/worldgui) for code (dataset via HF link). (Apache-2.0).
- **Access:** Public via HuggingFace (no login), or GitHub.

## 5. Email Summarization – **Email Thread Summary Dataset**

- **Source:** GTS.ai (Kaggle) – _Email Thread Summary_【35†L158-L165】.
- **URL:** [gts.ai/email-thread-summary](https://gts.ai/datasets/email-thread-summary-dataset) (originally from Kaggle).
- **Files:** CSV files: one per thread with emails, and one summary per thread. Format: columns for subject, body, etc.
- **Tasks:** Given an email thread (sequence of messages), produce a concise summary. Example: summarizing 8 emails to a few sentences.
- **Size:** 4,167 threads, 21,684 total emails【35†L158-L165】. Summaries are one per thread. Data ~ tens of MB.
- **Samples:** Many examples; see Kaggle or GTS.ai page. (No direct open link without login, but GTS.ai preview shows counts).
- **Answers:** Human-written summaries provided for each thread (ground truth).
- **Difficulty:** Intermediate (requires understanding discourse across multiple emails).
- **Download:** Kaggle API: `kaggle datasets download gtsemailthreadsummary`. Or see [GTS.ai](https://gts.ai/datasets/email-thread-summary-dataset) for links. (Likely CC BY-NC or similar – check Kaggle terms).
- **Access:** Kaggle account required. Also available via GTS.ai page for preview and download.

## 6. Table Extraction – **PubTabNet**

- **Source:** PubTabNet – IBM AUR NLP (Zhong et al. ECCV 2020)【79†L254-L262】.
- **URL:** [github.com/ibm-aur-nlp/PubTabNet](https://github.com/ibm-aur-nlp/PubTabNet) (IBM annotations under CDLA-Permissive 1.0【81†L246-L253】).
- **Files:** Dataset splits of PDF-extracted table images (.jpg) and JSONL annotations with HTML representation of each table【79†L254-L262】. Also code for parsing.
- **Tasks:** Given a table image (extracted from a scientific PDF), recover the table structure and cell contents (HTML). This exercises table understanding.
- **Size:** 568,000+ table images (train/val/test)【79†L254-L262】. JSONL annotations of equal length. Size: tens of GB (images + JSON).
- **Samples:** Provided sample HTML strings for each table. For example, `<html><table><tr><td>Token1</td><td>Token2</td></tr>…</table></html>`.
- **Answers:** Ground-truth HTML of each table in JSONL. (E.g., PubTabNet’s annotations have a ‘html’ field with cell tokens and bounding boxes).
- **Difficulty:** Advanced (requires OCR/vision or strong parsing of complex tables).
- **Download:** Via HuggingFace: `pip install huggingface_hub` then `hf_api dataset_download ajimeno/PubTabNet`. Or directly from GitHub links (provided in README). (CDLA-Permissive 1.0 for annotations; images under PMC OA terms【81†L246-L253】).
- **Access:** Public GitHub and HF. (Note: test set ground truth is withheld by organizers【79†L279-L288】).

## Curated 5-File Test Bundle

We suggest collecting one example file per domain (≈ begin/intermediate tasks) for quick testing:

- **Word Editing (OfficeBench):** _e.g._ `OfficeBench_example.docx` – a sample Word doc with placeholder text (can be from any source). No specific official sample; one may create a simple doc or adapt public text. (~50 KB).
- **Excel Sheet:** e.g. `GoSkills_Challenge1.xlsx` – from the GoSkills repo (Challenge1 data). Download by cloning [GoSkills Excel Challenge](https://github.com/Gbekoilias/Go-Skills-Excel-Challenge) and extracting `Challenge 1/challenge1.xlsx`. (~100 KB).
- **PowerPoint:** `PPTArena_sample.pptx` – select one deck from PPTArena. For example, clone [PPTArena](https://github.com/michaelofengend/PPTArena.git) and copy one Original deck:
  ```
  git clone https://github.com/michaelofengend/PPTArena.git
  cp PPTArena/Original/AddAgendaSlide_TestA.pptx ./PPTArena_sample.pptx
  ```
  (~500 KB).
- **PDF Form:** `WorldGUI_example.pdf` – take the sample PDF from WorldGUI. E.g. clone WorldGUI or download from HuggingFace. For example, use [dataset download](https://huggingface.co/datasets/hhenryz/WorldGUI-Bench) or code snippet:
  ```bash
  mkdir example && cd example
  # (Use huggingface_hub API or wget if direct link known)
  ```
  Suppose it’s the `project.pdf` from Adobe Acrobat task【85†L106-L114】. (~100 KB).
- **Email Thread:** `email_thread_1234.csv` – one thread from the EmailThread dataset (subject, from, body, etc.). After Kaggle download, pick any thread and save relevant columns. (~5 KB).
- **Table Image:** `PubTabNet_table.png` – an image from PubTabNet (or convert a page PDF containing a table). Download example via HuggingFace API (e.g. from `img_path` field). (~30 KB).

**Estimated total size:** ~0.8 MB.

**Download plan (example commands):**

```bash
git clone https://github.com/Gbekoilias/Go-Skills-Excel-Challenge.git
git clone https://github.com/michaelofengend/PPTArena.git
pip install huggingface_hub
python - << 'EOF'  # fetch WorldGUI PDF
from huggingface_hub import hf_hub_download
file = hf_hub_download("hhenryz/WorldGUI-Bench", "AdobeAcrobat/adobeacrobat_00/project.pdf")
EOF
# (requires HuggingFace login if not public; alternatively use their CLI)
# For email, use Kaggle API: kaggle datasets download gtsemailthreadsummary
```

Adjust paths as needed. The five files can be archived together (e.g. zip) for distribution.

## Automated Benchmarking Guide

To use these tasks for evaluating agents, consider:

- **Evaluation Metrics:**
  - _Document edits (Word/PDF/PPT)_: structural diff (compare XML/text before vs after), and visual diff for slides. Compute accuracy as percentage of specified edits completed. PPTArena uses combined VLM-judge and structural checks【42†L312-L321】【83†L1-L4】.
  - _Spreadsheets:_ formula correctness and chart comparison. Verify numeric answers or cell outputs vs ground truth. Use spreadsheet diff libraries or re-open both files to compare cell-by-cell.
  - _Forms (PDF):_ check that required fields are filled or text removed. Use PDF diff tools or OCR+text diff.
  - _Summarization:_ ROUGE or BERTScore between generated vs reference summary (for email threads). Human raters may also judge relevance and coherence.
  - _Table Extraction:_ use TEDS or HTML structure match (see PubTabNet’s TEDS metric).

- **Scoring Rubrics:**  
  Define per-domain rubrics: e.g. “all edits done = full credit, partial edits = proportionate credit, extraneous changes = penalty.” PPTArena’s approach (instruction-following and visual quality) is an example【42†L310-L318】.

- **Automation Tips:**
  - Use **diff tools**: python-docx or Pandas for documents/sheets; python-pptx for slides; PDFMiner for PDFs; HTML diff for tables.
  - Leverage **LLM judges**: as done in PPTArena, use a vision-language model to compare screenshots (optional, for human-like scoring).
  - For summarization, readily available metrics (ROUGE). Preprocess emails (strip signatures) before evaluation.

- **Workflow Example (Mermaid):**
  ```mermaid
  flowchart LR
    A[Task Prompt & Input File] -->|Agent executes| B[Agent Output File]
    B --> C{Automatic Judge}
    C -->|Match| D[Pass]
    C -->|Mismatch| E[Fail/Score Deduction]
    D --> F[Score Report]
    E --> F
  ```
  Here, each task’s input file and instructions go to the agent; output is automatically scored against the ground truth.

## Top-10 Resource Comparison

| Resource                          | Domain(s)             | File Types                   | Sample Count                       | Answers                            | License                    | Ease of Access       | Comments                                               |
| --------------------------------- | --------------------- | ---------------------------- | ---------------------------------- | ---------------------------------- | -------------------------- | -------------------- | ------------------------------------------------------ |
| OfficeBench【27†L287-L295】       | Word, Excel, Email    | JSON (tasks)                 | ~300 tasks                         | Eval scripts (config)              | Apache-2.0                 | Public GitHub        | Multi-app workflows; answers via scripts               |
| PPTArena【42†L327-L334】          | PowerPoint editing    | .pptx (Original/GroundTruth) | 100 decks (~800 edits)             | GroundTruth decks【42†L327-L334】  | MIT                        | Public GitHub        | In-place slide edits; strong evaluation                |
| WorldGUI (Office)【85†L106-L114】 | PDF editing (Acrobat) | .pdf + JSON                  | ~30 PDF tasks (Acrobat)            | Ground-truth plans【85†L106-L114】 | Apache-2.0                 | HuggingFace/GitHub   | Rich GUI tasks; dynamic initial states【85†L106-L114】 |
| Email Thread Summ【35†L158-L165】 | Email summarization   | .csv                         | 4167 threads【35†L158-L165】       | Human summaries                    | (Kaggle terms)             | Kaggle account       | Large email summary dataset; ready labels              |
| PubTabNet【79†L254-L262】         | Table extraction      | .jpg + .jsonl                | 568K tables【79†L254-L262】        | HTML annotations【79†L254-L262】   | CDLA-Permissive 1.0        | Public (HuggingFace) | State-of-art tables; large dataset                     |
| DocVQA【86†L124-L132】            | Document QA           | images + JSON                | 12K images, 50K Qs【86†L126-L134】 | Answer spans                       | (Challenge T&C)            | Registration req.    | Visual QA for docs (ad-hoc Q/A)                        |
| CORD (Receipts)                   | Tables/invoices       | images + JSON                | 1000+ receipts                     | Field-key labels                   | Open (CC BY)               | Kaggle (login)       | Real-world receipt parsing                             |
| DocBank【92†L258-L262】           | Layout analysis       | Page images                  | 500K pages【92†L258-L262】         | Token-level labels                 | Apache-2.0                 | Public GitHub        | Large layout dataset (sections, tables, etc.)          |
| SROIE (Receipts)                  | OCR on receipts       | images + CSV                 | ~1000 receipts                     | OCR text, fields                   | Lic.: TAP (used in ICML17) | Public               | OCR extraction; less structured                        |
| ICDAR SLR (Tables)                | Table recognition     | images + JSON                | ~1000 samples                      | Table structure                    | Competition (no license)   | Public (ICDAR)       | Document table challenges (standard tasks)             |

_Table Legend:_ “Sample Count” refers to number of files/tasks. “Answers” indicates the presence of ground-truth outputs or annotations. “Ease of Access” notes any login or DOI requirements.

Each of the above resources brings tasks and ground truth for evaluation. We have focused on those covering the requested domains (Word/Docs, Excel, PPT, PDF, email/summaries, tables). Others like DocVQA or CORD are related corpora for document QA or table data, which could be repurposed for system tests.

**Sources:** Descriptions and stats above are drawn from the respective project pages and papers【27†L287-L295】【85†L106-L114】【42†L294-L299】【35†L158-L165】【79†L254-L262】【92†L258-L262】. Charts/figures not directly reproduced here, but workflows and example task structures are informed by these publications.
