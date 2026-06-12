"""CLI to hydrate Ross (ClickHouse) from site.md docs.

Usage:
  python -m memory_service.ingest_cli <dir-or-files...>
  python -m memory_service.ingest_cli            # defaults to GHOSTWIKI_WIKI_ROOT

Then query:
  python -m memory_service.ingest_cli --query "how do I deploy on render?"

Reads ClickHouse + embedding config from env (see .env.example).
"""
import os
import sys
import glob
import json

from .embedder import Embedder
from .clickhouse_store import ClickHouseRetriever


def _read(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def _collect(args):
    files = []
    for a in args:
        if os.path.isdir(a):
            files += glob.glob(os.path.join(a, "**", "*.md"), recursive=True)
        elif os.path.isfile(a):
            files.append(a)
    return files


def main(argv):
    embedder = Embedder()
    ross = ClickHouseRetriever(embedder=embedder)
    if not ross.enabled:
        print("ClickHouse disabled — set CLICKHOUSE_HOST and embedding env vars.")
        return 1

    if argv and argv[0] == "--query":
        q = " ".join(argv[1:])
        result = ross.retrieve(q)
        print(json.dumps(result, indent=2, default=str) if result else "No results.")
        return 0

    targets = argv or [os.getenv("GHOSTWIKI_WIKI_ROOT", "./wiki")]
    files = _collect(targets)
    if not files:
        print(f"No .md files found in: {targets}")
        return 1
    print(f"Ingesting {len(files)} site.md docs into Ross...")
    n, warnings = ross.ingest_files(files, _read)
    print(f"  chunks loaded: {n}")
    for w in warnings:
        print(f"  warn: {w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
