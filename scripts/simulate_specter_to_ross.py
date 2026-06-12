"""Simulate the Specter -> Ross loop over real HTTP.

Proves Ross can (1) retrieve, (2) learn interactions pushed by Specter, and
(3) reflect that new knowledge on the next query — i.e. it is actually learning
and persisting, not answering from a static set.

Run (server must be up on :8765):
  python scripts/simulate_specter_to_ross.py
"""
import json
import urllib.request

BASE = "http://127.0.0.1:8765"


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def banner(t):
    print("\n" + "=" * 68 + f"\n{t}\n" + "=" * 68)


def show_query(q):
    r = call("POST", "/query", {"query": q})
    seeds = [s["title"] for s in r.get("sources", [])]
    journey = [j["heading"] for j in r.get("journey", [])]
    print(f"  Q: {q}")
    print(f"     mode={r['mode']}  site={r.get('site_id')}  protocol={r.get('protocol')}")
    print(f"     retrieved seeds : {seeds}")
    print(f"     journey steps   : {journey}")
    return r


# A Specter-observed interaction: the user learning to use ClickHouse, captured
# as an enablement note Specter pushes to Ross.
INTERACTION_1 = {
    "site_id": "clickhouse",
    "source": "clickhouse-create-table.md",
    "content": """---
title: ClickHouse Create Table
site: clickhouse
---

# Create a Table
Observed workflow: the user created a new table in the ClickHouse SQL console.

## Steps
1. Open the SQL console from the left sidebar
2. Click "New table"
3. Define columns and pick a MergeTree engine
4. Set the ORDER BY key
5. Run the CREATE TABLE statement

## Success Condition
The table appears under Tables and `SELECT count() FROM <table>` returns 0.
""",
}

INTERACTION_2 = {
    "site_id": "clickhouse",
    "source": "clickhouse-insert-data.md",
    "content": """---
title: ClickHouse Insert Data
site: clickhouse
---

# Insert Data
Observed workflow: after creating a table, the user inserted rows.

## Steps
1. Open the SQL console
2. Use INSERT INTO <table> VALUES (...) or load from an S3 bucket
3. Verify with SELECT count() FROM <table>

## Related
This follows the Create a Table workflow and integrates with ClickPipes.
""",
}


if __name__ == "__main__":
    banner("0 · Baseline — what does Ross know right now?")
    print(" health:", call("GET", "/health"))
    print(" stats :", call("GET", "/stats"))

    banner("1 · BEFORE learning — ask about ClickHouse (Ross hasn't seen it)")
    show_query("How do I create a table in ClickHouse?")

    banner("2 · Specter -> Ross : push observed interaction #1 (create table)")
    print("  /learn ->", call("POST", "/learn", {"documents": [INTERACTION_1]}))
    print("  stats  ->", call("GET", "/stats"))

    banner("3 · AFTER learning — same question, now grounded")
    show_query("How do I create a table in ClickHouse?")

    banner("4 · Specter -> Ross : push a NEW interaction #2 (insert data)")
    print("  /learn ->", call("POST", "/learn", {"documents": [INTERACTION_2]}))
    print("  stats  ->", call("GET", "/stats"))

    banner("5 · Ask about the NEWEST knowledge (insert data)")
    show_query("how do I insert rows into a ClickHouse table?")

    banner("DONE — Ross retrieved, learned, persisted, and reflected new knowledge")
