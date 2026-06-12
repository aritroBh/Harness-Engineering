import pytest
from fastapi.testclient import TestClient
from memory_service.app import app
import memory_service.app as app_module
import memory_service.wiki_store as wiki_store_module
import os
import json

client = TestClient(app)

def test_empty_wiki_no_fake_answer(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    response = client.post("/query", json={"query": "How do I make a cake?"})
    data = response.json()
    assert data["answer"] == "No relevant information found in the wiki."
    assert len(data["sources"]) == 0

def test_irrelevant_query_no_fake_answer(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    (root / "unrelated.md").write_text("# Car repair\nHow to fix a car.")
    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    response = client.post("/query", json={"query": "How do I make a cake?"})
    data = response.json()
    assert data["answer"] == "No relevant information found in the wiki."
    assert len(data["sources"]) == 0

def test_malformed_markdown_does_not_crash(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    # completely malformed frontmatter and steps
    (root / "malformed.md").write_text("---malformed:\n\nno closing dashes\n# Title\n## Steps\nsomething")
    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    response = client.post("/query", json={"query": "Title something"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["sources"]) > 0
    assert "Found relevant information but no explicit steps." in data["answer"]

def test_multiple_wiki_pages_ranked(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    (root / "a.md").write_text("# Apple Cake\nHow to make an apple cake.")
    (root / "b.md").write_text("# Car repair\nHow to fix a car.")
    (root / "c.md").write_text("# Chocolate Cake\nBest cake ever.")

    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    response = client.post("/query", json={"query": "cake"})
    data = response.json()

    assert len(data["sources"]) == 2

    # Apple Cake should be returned and verifiable by title and path
    assert data["sources"]
    assert any(
        s.get("title") == "Apple Cake" or s.get("path", "") == "a.md"
        for s in data["sources"]
    )

def test_missing_steps_header_fallback(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    # missing ## Steps but has a numbered list
    (root / "bullet.md").write_text("# Apple Cake steps\n1. Get apples\n2. Bake cake")
    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    response = client.post("/query", json={"query": "what are the apple cake steps"})
    data = response.json()

    assert "No relevant information found" not in data["answer"]
    assert "1. Get apples" in data["answer"] or "2. Bake cake" in data["answer"]
    assert len(data["sources"]) >= 1

def test_correction_page_changes_subsequent_query(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()
    (root / "workflow.md").write_text("# Create Event Recap\nHere is how to create an event recap.\n## Steps\n1. Click Create Event\n2. enter title\n")
    app_module.WIKI_ROOT = str(root)
    app_module.wiki_store = wiki_store_module.WikiStore(str(root))

    # Query before correction
    response1 = client.post("/query", json={"query": "create event"})
    data1 = response1.json()
    assert "missing success condition" not in data1["answer"].lower()

    # Apply correction
    (root / "correction.md").write_text("# Correction: missing-step\nCorrection Text: Ensure there is a success condition defined for event creation.\nReference: [[workflow]]\n")

    # Query after correction
    response2 = client.post("/query", json={"query": "create event"})
    data2 = response2.json()
    assert "success condition" in data2["answer"].lower()
