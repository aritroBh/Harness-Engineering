import pytest
from fastapi.testclient import TestClient
from memory_service.app import app
import os
import urllib.parse
from pathlib import Path

client = TestClient(app)

def test_valid_page():
    # Make sure we have a valid page to fetch
    test_file = Path("wiki/valid_page.md")
    import memory_service.app
    memory_service.app.WIKI_ROOT = str(test_file.parent.resolve())
    memory_service.app.wiki_store.root_dir = str(test_file.parent.resolve())
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("# Valid Page\nContent")

    url = "/wiki/pages/valid_page.md"
    response = client.get(url)
    assert response.status_code == 200

def test_path_traversal_graph():
    url = "/wiki/pages/" + urllib.parse.quote("../graph.json", safe="")
    response = client.get(url)
    assert response.status_code == 403

def test_path_traversal_passwd():
    url = "/wiki/pages/" + urllib.parse.quote("../../../../../../../etc/passwd", safe="")
    response = client.get(url)
    assert response.status_code == 403

def test_sibling_prefix_bypass():
    # setup a sibling directory that starts with the same prefix
    # for instance, if wiki is in ./wiki, make ./wiki_evil
    evil_dir = Path("./wiki_evil")
    evil_dir.mkdir(parents=True, exist_ok=True)
    secret_file = evil_dir / "secret.md"
    secret_file.write_text("Secret")

    url = "/wiki/pages/" + urllib.parse.quote("../wiki_evil/secret.md", safe="")
    response = client.get(url)
    assert response.status_code == 403
