"""Offline tests for the Ross retrieval layer — no ClickHouse / no network.

Validates semantic chunking, graph extraction, tokenization and RRF fusion
so the retrieval logic is verifiable in CI without infra.
Run: python -m memory_service.tests.test_ross_offline
"""
from memory_service.chunker import chunk_site_md, tokenize, split_sections
from memory_service.clickhouse_store import ClickHouseRetriever

SAMPLE = """---
title: Render Deploy
site: render
---

# Overview
Render lets you deploy web services from a Git repo.

## Create a Web Service
1. Click New + Web Service
2. Connect your GitHub repo
3. Set the build command

## Add Environment Variables
Open the Environment tab and add KEY=VALUE pairs.
This integrates with ClickHouse for storage.
"""


def test_split_sections():
    secs = split_sections(SAMPLE)
    headings = [s["heading"] for s in secs]
    assert "Overview" in headings
    assert "Create a Web Service" in headings
    assert "Add Environment Variables" in headings


def test_chunk_and_graph():
    res = chunk_site_md("render-deploy.md", SAMPLE, known_sites=["render", "clickhouse"])
    chunks, nodes, edges = res["chunks"], res["nodes"], res["edges"]

    assert len(chunks) == 3, [c.heading for c in chunks]
    assert all(c.site_id == "render" for c in chunks)
    assert all(c.embedding == [] for c in chunks)  # not embedded yet

    rels = {e.relation for e in edges}
    assert "part_of" in rels
    assert "next_step" in rels
    # last section mentions clickhouse -> a 'mentions' edge
    assert "mentions" in rels, rels

    # next_step chain links consecutive sections
    next_edges = [e for e in edges if e.relation == "next_step"]
    assert len(next_edges) == 2


def test_tokenize_drops_stopwords():
    toks = tokenize("How do I deploy the web service with Render?")
    assert "deploy" in toks and "render" in toks
    assert "the" not in toks and "do" not in toks


def test_rrf_fusion_orders_by_consensus():
    a = [{"chunk_id": "x"}, {"chunk_id": "y"}, {"chunk_id": "z"}]
    b = [{"chunk_id": "y"}, {"chunk_id": "x"}, {"chunk_id": "w"}]
    fused = ClickHouseRetriever._rrf(a, b)
    ids = [f["chunk_id"] for f in fused]
    # x and y appear in both lists near the top -> rank ahead of single-list z/w
    assert ids[0] in ("x", "y") and ids[1] in ("x", "y")
    assert set(ids) == {"x", "y", "z", "w"}


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} offline Ross tests passed")
