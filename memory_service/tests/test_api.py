import pytest
from fastapi.testclient import TestClient
from memory_service.app import app
from memory_service.schemas import IngestResponse, QueryResponse, LintResponse

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()

def test_ingest_shape_fallback():
    # Test with no files, assuming fallback if no cognee
    response = client.post("/ingest", json={"files": []})
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "mode" in data
    assert "warnings" in data
    assert "sources_ingested" in data
    assert data["mode"] == "fallback"

def test_query_shape_fallback():
    response = client.post("/query", json={"query": "test"})
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "mode" in data
    assert "warnings" in data
    assert "sources" in data
    assert "answer" in data
    assert data["mode"] == "fallback"

def test_lint_shape():
    response = client.post("/lint", json={})
    assert response.status_code == 200
    data = response.json()
    assert "ok" in data
    assert "mode" in data
    assert "warnings" in data
    assert "issues" in data

def test_no_fake_answers():
    # If the wiki is empty and cognee is not active, it should return a generic "not found"
    response = client.post("/query", json={"query": "something random"})
    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "No relevant information found in the wiki."
    assert len(data["sources"]) == 0
