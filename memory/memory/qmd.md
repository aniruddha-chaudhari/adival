# QMD - Query Markup Documents

On-device hybrid search engine for markdown notes, meeting transcripts, docs, and knowledge bases. Runs fully locally via node-llama-cpp with GGUF models.

## Installation
```sh
bun install -g @tobilu/qmd
# or
npx @tobilu/qmd ...
```

## Key Commands

### Collection Setup
```sh
qmd collection add ~/notes --name notes
qmd collection add ~/Documents/meetings --name meetings
qmd context add qmd://notes "Personal notes and ideas"
qmd embed                          # generate vector embeddings
```

### Search
```sh
qmd search "keyword"               # BM25 full-text (fast)
qmd vsearch "how to deploy"        # semantic vector search
qmd query "topic"                  # hybrid + reranking (best quality)
```

### Retrieval
```sh
qmd get "path/to/doc.md"           # by filepath
qmd get "#abc123"                  # by docid (from search results)
qmd get "file.md:50" -l 100        # starting at line 50, max 100 lines
qmd multi-get "journals/2025-05*.md"
```

### Agent-Friendly Flags
```sh
--json          # structured JSON output with snippets
--files         # docid,score,filepath,context (one per line)
--all           # return all matches
--min-score 0.3 # filter by score threshold
-n 10           # number of results
-c notes        # restrict to collection
--full          # full document content
```

### Status & Maintenance
```sh
qmd status      # index health + active MCP daemon
qmd update      # re-index all collections
qmd cleanup     # clean orphaned data
```

## MCP Server

```sh
qmd mcp                            # stdio (default)
qmd mcp --http                     # HTTP on localhost:8181
qmd mcp --http --daemon            # background daemon
qmd mcp stop                       # stop daemon
```

### MCP Tools
- `qmd_search` - BM25 keyword search
- `qmd_vector_search` - semantic search
- `qmd_deep_search` - hybrid + query expansion + reranking
- `qmd_get` - retrieve document by path or docid
- `qmd_multi_get` - retrieve multiple documents by glob/list/docids
- `qmd_status` - index health and collection info

## Models (auto-downloaded to ~/.cache/qmd/models/)
| Model | Purpose | Size |
|-------|---------|------|
| embeddinggemma-300M-Q8_0 | Vector embeddings | ~300MB |
| qwen3-reranker-0.6b-q8_0 | Re-ranking | ~640MB |
| qmd-query-expansion-1.7B-q4_k_m | Query expansion | ~1.1GB |

## Data Location
- Index: `~/.cache/qmd/index.sqlite`
- Models: `~/.cache/qmd/models/`

## Score Guide
| Score | Meaning |
|-------|---------|
| 0.8–1.0 | Highly relevant |
| 0.5–0.8 | Moderately relevant |
| 0.2–0.5 | Somewhat relevant |
| 0.0–0.2 | Low relevance |

## Search Pipeline (query command)
1. LLM query expansion → original + 2 variants
2. Parallel BM25 + vector search for each variant
3. RRF fusion (original query ×2 weight)
4. Top 30 candidates sent to LLM reranker
5. Position-aware blend (rank 1-3: 75% RRF, rank 4-10: 60% RRF, rank 11+: 40% RRF)
