import os
import json
from memory_service.lint_engine import LintEngine
from memory_service.wiki_store import WikiStore

def test_lint_rules(tmp_path):
    graph_path = tmp_path / "graph.json"
    wiki_store = WikiStore(str(tmp_path))
    engine = LintEngine(wiki_store)

    # 1. Test missing synthetic and success condition
    graph_data = {
        "sessions": [
            {
                "id": "sess-1",
                "steps": [
                    {
                        "action": "click",
                        "instruction": "delete the file",
                        "targetConfidence": 0.5
                    }
                ]
            }
        ]
    }
    graph_path.write_text(json.dumps(graph_data))

    issues = engine.run_all_rules(str(graph_path))
    rules = [iss.rule for iss in issues]

    assert "synthetic-data-label" in rules
    assert "missing-success-condition" in rules
    assert "missing-app-name" in rules
    assert "missing-coordinate-frame" in rules
    assert "low-confidence-target" in rules
    assert "unsafe-action-without-confirmation" in rules

    # 2. Test valid configuration
    valid_graph = {
        "synthetic": True,
        "sessions": [
            {
                "id": "sess-2",
                "successCondition": "File is deleted",
                "steps": [
                    {
                        "action": "click",
                        "appName": "TestApp",
                        "coordinateFrame": "screen",
                        "targetConfidence": 0.8,
                        "instruction": "delete the file",
                        "requiresConfirmation": True
                    }
                ]
            }
        ]
    }
    graph_path.write_text(json.dumps(valid_graph))

    issues2 = engine.run_all_rules(str(graph_path))
    assert len(issues2) == 0

