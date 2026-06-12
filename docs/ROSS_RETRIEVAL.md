# Ross — KG Retrieval Layer ("Retr KG")

Ross is the cloud knowledge-graph retrieval layer that lets Specter/Harvey pull
the right **enablement context** for a user or agent goal. It is the `Retr KG`
arrow on the architecture board.

```
Scrape sponsor docs ──► Airbyte (ETL/sync) ──► Knowledge Graph in ClickHouse ("Ross")
                                                      │
                          POST /query  ◄── Harvey/Specter (local ghost)
                                                      │  structured JSON
                                                      ▼
                                   enablement journey → ghost cursor + OpenUI panel
```

## Why hybrid GraphRAG on ClickHouse

`site.md` protocol docs mix natural language ("how do I guide the user to…")
with **exact terms** (step names, field IDs, endpoints). Pure vector search
misses the exact terms; pure keyword search misses paraphrase. Ross fuses both
and walks the graph for connected context — all inside one store:

1. **Seed** — hybrid search: vector (`cosineDistance`) + keyword
   (`multiSearchAny` / `positionCaseInsensitive`), fused with Reciprocal Rank
   Fusion (RRF).
2. **Expand** — 1-hop walk over `kg_edges` (`next_step`, `mentions`) to gather
   the connected enablement path.
3. **Assemble** — ordered journey + citations, returned as JSON for Harvey.

Keeping vectors + graph + keyword in ClickHouse means **one low-latency store**
(important for a conversational UI) and deep use of a sponsor (ClickHouse),
hydrated by another (Airbyte).

## Data model (ClickHouse)

| Table | Purpose |
| --- | --- |
| `doc_chunks` | Semantic chunks of `site.md` + `embedding Array(Float32)` + `tokens` |
| `kg_nodes` | One node per document and per section |
| `kg_edges` | `part_of` · `next_step` · `mentions` relations |

All tables are `ReplacingMergeTree(ingested_at)` so re-ingesting a doc upserts.

## Retrieval output (the contract Harvey consumes)

`POST /query {"query": "..."}` →

```json
{
  "ok": true,
  "mode": "clickhouse",
  "answer": "Enablement context for: ...",
  "site_id": "render",
  "protocol": "render-deploy",
  "journey": [
    {"step": 1, "heading": "Create a Web Service", "detail": "...", "chunk_id": "…"}
  ],
  "graph_context": [
    {"heading": "Add Environment Variables", "relation": "next_step", "content": "…"}
  ],
  "sources": [{"id": "…", "title": "…", "content": "…", "score": 0.81}]
}
```

`journey` is the ordered path Harvey renders as ghost-cursor steps; `graph_context`
is connected material discovered via graph expansion. Output is multimodal-ready
(attach element coordinates / images to a step later).

## Configuration

See `.env.example` (`CLICKHOUSE_*`, `EMBED_*`). If `CLICKHOUSE_HOST` is unset,
Ross disables itself and the service keeps its previous local-search fallback,
so the existing demo never hard-breaks.

Embeddings are pluggable: `truefoundry` (sponsor, OpenAI-compatible gateway),
`voyage` (Anthropic-recommended), `openai`, or `local` (fastembed, zero-key).

## Usage

```bash
pip install -r memory_service/requirements.txt

# Hydrate Ross from site.md docs
python -m memory_service.ingest_cli ./demo-workflows/event-recap/wiki

# Or via the running service
curl -s -X POST http://127.0.0.1:8765/ingest -d '{"files": []}' -H 'Content-Type: application/json'
curl -s -X POST http://127.0.0.1:8765/query  -d '{"query":"how do I deploy on render?"}' -H 'Content-Type: application/json'

# CLI query (bypasses HTTP)
python -m memory_service.ingest_cli --query "how do I deploy on render?"
```

## Tests

```bash
# Offline (no ClickHouse / no network): chunking, graph extraction, RRF
python -m memory_service.tests.test_ross_offline
```

## Backend priority

`/query` and `/ingest` try **Ross (ClickHouse)** first, then the cognee adapter,
then local markdown fallback — each degrades gracefully to the next.
