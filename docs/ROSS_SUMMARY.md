# Ross — Retrieval & Learning Layer (team summary)

**What it is:** the cloud brain ("Retr KG" on the board). Specter pushes what it
observes; Ross **learns it, stores it, and retrieves the right enablement context**
back — for both humans and agents.

Branch: `feat/ross-retrieval` · Service: `memory_service/` (FastAPI on `:8765`)

---

## The flow (simple)

```
                       ┌──────────────────────────────────────────┐
   Specter / Harvey    │                  ROSS                     │
  (local ghost UI)     │        memory_service  (FastAPI)          │
        │              │                                           │
        │  POST /learn │   1. chunk the interaction (by section)   │
        ├─────────────►│   2. embed it  (Azure → TrueFoundry)      │
        │  "I saw the  │   3. store vectors + graph in ClickHouse  │
        │   user do X" │                                           │
        │              │            ▼ persisted ▼                  │
        │              │   ┌───────────────────────────────┐       │
        │              │   │  ClickHouse  (the knowledge)   │       │
        │              │   │  doc_chunks · kg_nodes · edges │       │
        │              │   └───────────────────────────────┘       │
        │  POST /query │   1. hybrid search (vector + keyword, RRF) │
        ├─────────────►│   2. walk the graph (next_step, mentions) │
        │  "How do I   │   3. return an ordered enablement journey │
        │◄─────────────┤      as JSON  →  Harvey guides the user   │
        │   do X?"     │                                           │
                       └──────────────────────────────────────────┘
```

**One sentence:** *Specter teaches Ross by sending interactions; Ross remembers them
in ClickHouse and hands back the right step-by-step guidance on the next question.*

---

## What we proved (live, over real HTTP)

| Step | Action | Result |
| --- | --- | --- |
| 1 | Ask *"How do I create a table in ClickHouse?"* **before learning** | ❌ Ross only knew the Luma demo → wrong domain |
| 2 | Specter `POST /learn` (observed "create table") | 🧠 +3 chunks → ClickHouse (`10 → 13`) |
| 3 | Ask the **same question** again | ✅ Returns `clickhouse-create-table` → *Create a Table · Steps · Success Condition* |
| 4 | Specter `POST /learn` a **new** interaction (insert data) | 🧠 +3 chunks (`13 → 16`) |
| 5 | Ask about the **newest** knowledge | ✅ Returns `clickhouse-insert-data` |

**Persistence confirmed at the DB level:** 16 chunks physically stored in ClickHouse,
each with a 3072-dim embedding vector + graph edges (`part_of`, `next_step`).
Not volatile — it lives in the cloud store.

---

## How retrieval works (the engine)

1. **Hybrid search** — vector similarity (`cosineDistance`) **+** keyword match
   (`multiSearchAny`), fused with **Reciprocal Rank Fusion (RRF)**.
2. **Graph expansion** — 1-hop walk over `kg_edges` to pull connected steps.
3. **Assemble** — an ordered **journey** (steps + headings + citations) returned as JSON
   for Harvey to render as ghost-cursor steps / OpenUI panel.

All three (vectors + keyword + graph) live in **one ClickHouse store** → low latency.

---

## API (what Specter calls)

| Endpoint | Purpose |
| --- | --- |
| `POST /learn` | Specter pushes interactions → Ross learns + persists |
| `POST /query` | Ask a goal → grounded `journey` + `graph_context` JSON |
| `GET /stats` | Live knowledge size (chunks/nodes/edges per site) |
| `GET /health` | Status (ClickHouse + embedding provider) |
| `GET /docs` | Swagger UI — try it all in the browser |

**`/learn` payload:**
```json
{ "documents": [ { "site_id": "clickhouse", "source": "create-table.md", "content": "..." } ] }
```

**`/query` response (shortened):**
```json
{ "mode": "clickhouse", "site_id": "clickhouse", "protocol": "clickhouse-create-table",
  "answer": "...", "journey": [ {"step": 1, "heading": "Create a Table", "detail": "..."} ],
  "graph_context": [ {"relation": "next_step", "heading": "Steps"} ] }
```

---

## Sponsors used in this slice

- **ClickHouse** — vector + keyword + graph store (the "Ross" memory)
- **TrueFoundry** — LLM gateway in front of **Azure OpenAI** (`text-embedding-3-large`)
- *(next)* **Airbyte** — sync scraped sponsor `site.md` docs into ClickHouse

---

## Run it

```bash
# 1. configure (already done in .env: CLICKHOUSE_* + EMBED_* )
# 2. start the service
python -m uvicorn memory_service.app:app --port 8765
# 3. verify connections (status-only, no secrets printed)
python scripts/verify_connections.py
# 4. see the learning loop end to end
python scripts/simulate_specter_to_ross.py
# 5. browser: http://127.0.0.1:8765/docs
```
