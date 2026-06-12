from fastapi.testclient import TestClient
from memory_service.app import app
import os
import json

client = TestClient(app)

def test_lint_api(tmp_path):
    graph_path = tmp_path / "graph.json"
    wiki_root = tmp_path / "wiki"
    wiki_root.mkdir()

    # Set WIKI_ROOT to tmp_path/wiki, so graph_path (tmp_path/graph.json) is found correctly.
    # Because app.py expects graph.json at `os.path.join(os.path.dirname(WIKI_ROOT), "graph.json")`
    os.environ["GHOSTWIKI_WIKI_ROOT"] = str(wiki_root)

    # Reload app configuration to use the new env var
    import importlib
    import memory_service.app
    importlib.reload(memory_service.app)

    from memory_service.app import app as reloaded_app
    test_client = TestClient(reloaded_app)

    graph_data = {
        "sessions": [
            {"id": "sess-demo", "steps": [{"action": "click"}]}
        ]
    }
    graph_path.write_text(json.dumps(graph_data))

    res = test_client.post("/lint", json={})
    assert res.status_code == 200

    issues = res.json()["issues"]
    assert len(issues) > 0
    rules = [iss["rule"] for iss in issues]
    assert "missing-success-condition" in rules
