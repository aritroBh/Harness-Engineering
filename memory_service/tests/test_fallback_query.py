from memory_service.wiki_store import WikiStore
from fastapi.testclient import TestClient
from memory_service.app import app

client = TestClient(app)

def test_fallback_query(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()

    # Create relevant files with ## Steps to test dynamic extraction
    markdown_content = """# Create Event Recap
Here is how to create an event recap.
## Steps
1. Click Create Event
2. enter title
3. enter date
4. enter time
5. enter location
6. enter host
"""
    (root / "workflow-event-recap-session-1.md").write_text(markdown_content)
    (root / "unrelated.md").write_text("# Something Else\nNothing to see here")

    # Override WIKI_ROOT for the test
    import memory_service.app
    import memory_service.wiki_store
    memory_service.app.WIKI_ROOT = str(root)
    memory_service.app.wiki_store = memory_service.wiki_store.WikiStore(str(root))

    query = "How do I create a calendar event from this event page?"
    response = client.post("/query", json={"query": query})
    data = response.json()

    assert data["ok"] == True
    assert data["mode"] == "fallback"

    answer = data["answer"].lower()
    assert "click create event" in answer
    assert "title" in answer
    assert "date" in answer
    assert "time" in answer
    assert "location" in answer
    assert "host" in answer
    assert len(data["sources"]) > 0
