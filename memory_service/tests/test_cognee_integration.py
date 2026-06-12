import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from memory_service.cognee_adapter import CogneeAdapter
import os

@pytest.fixture
def mock_cognee_module():
    mock_cognee = MagicMock()
    mock_cognee.SearchType = MagicMock()
    mock_cognee.SearchType.GRAPH_COMPLETION = "GRAPH_COMPLETION"
    return mock_cognee

@pytest.fixture
def adapter(mock_cognee_module):
    a = CogneeAdapter(enabled=True)
    a.enabled = True # Force it True after the init might set it to False
    a._cognee = mock_cognee_module
    a._SearchType = mock_cognee_module.SearchType
    return a

@pytest.mark.asyncio
async def test_query_recall_success(adapter, mock_cognee_module):
    mock_cognee_module.recall = AsyncMock(return_value=["Recalled answer from knowledge graph."])

    success, answer, sources, warnings = await adapter.query("Test query")

    assert success is True
    assert sources[0]["content"] == "Recalled answer from knowledge graph."
    assert len(warnings) == 0

@pytest.mark.asyncio
async def test_query_recall_fails_search_success(adapter, mock_cognee_module):
    mock_cognee_module.recall = AsyncMock(side_effect=Exception("recall error"))

    # Search returns a list of result objects/dicts
    mock_cognee_module.search = AsyncMock(return_value=[
        {"id": "doc1", "text": "Search text result", "score": 0.9}
    ])

    success, answer, sources, warnings = await adapter.query("Test query")

    assert success is True
    assert "Search text result" in sources[0]["content"]
    assert any("recall() failed" in w for w in warnings)

@pytest.mark.asyncio
async def test_query_both_fail(adapter, mock_cognee_module):
    mock_cognee_module.recall = AsyncMock(side_effect=Exception("recall error"))
    mock_cognee_module.search = AsyncMock(side_effect=Exception("search error"))

    success, answer, sources, warnings = await adapter.query("Test query")

    assert success is False
    assert any("recall() failed" in w for w in warnings)
    assert any("search() failed" in w for w in warnings)
