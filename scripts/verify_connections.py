"""Health-check ClickHouse + the TrueFoundry embeddings gateway.

Prints ONLY status (OK/FAIL, HTTP codes, masked host) — never secret values.
Run: python scripts/verify_connections.py
"""
import os
import sys
import json
import urllib.request
import urllib.error


def load_env(path):
    if not os.path.exists(path):
        return False
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
    return True


def mask_host(h):
    if not h:
        return "<unset>"
    h = h.replace("https://", "").replace("http://", "").split(":")[0]
    parts = h.split(".")
    if parts:
        parts[0] = parts[0][:3] + "***"
    return ".".join(parts)


def check_clickhouse():
    host = os.getenv("CLICKHOUSE_HOST", "")
    if not host:
        print("ClickHouse : SKIP (CLICKHOUSE_HOST unset)")
        return
    # accept either bare host or full URL in CLICKHOUSE_HOST
    clean = host.replace("https://", "").replace("http://", "").split(":")[0]
    print(f"ClickHouse : host={mask_host(host)} ...", end=" ", flush=True)
    try:
        import clickhouse_connect
        secure = os.getenv("CLICKHOUSE_SECURE", "true").lower() == "true"
        client = clickhouse_connect.get_client(
            host=clean,
            port=int(os.getenv("CLICKHOUSE_PORT", "8443")),
            username=os.getenv("CLICKHOUSE_USER", "default"),
            password=os.getenv("CLICKHOUSE_PASSWORD", ""),
            database=os.getenv("CLICKHOUSE_DATABASE", "default"),
            secure=secure,
        )
        v = client.query("SELECT version()").result_rows[0][0]
        print(f"OK 200  (server v{v})")
    except Exception as e:
        print(f"FAIL  ({type(e).__name__}: {str(e)[:120]})")


_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def _post_json(url, key, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "User-Agent": _UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]
    except Exception as e:
        return None, f"{type(e).__name__}: {str(e)[:120]}"


def check_embeddings():
    base = os.getenv("EMBED_BASE_URL", "").rstrip("/")
    key = os.getenv("EMBED_API_KEY", "")
    model = os.getenv("EMBED_MODEL", "")
    prov = os.getenv("EMBED_PROVIDER", "")
    if not base or not key or not model:
        print("Embeddings : SKIP (EMBED_BASE_URL / EMBED_API_KEY / EMBED_MODEL incomplete)")
        return
    if not prov:
        print("Embeddings : WARN  EMBED_PROVIDER is empty -> set it to 'truefoundry'")
    print(f"Embeddings : base={mask_host(base)} model={model}")

    # Probe common OpenAI-compatible paths; report status for each, find the 200.
    # Also probe the tenant control-plane host in case the managed gateway host
    # is not the right one for this token.
    extra_base = os.getenv("EMBED_BASE_URL_ALT", "https://hacktonharnnes.truefoundry.cloud").rstrip("/")
    candidates = [
        f"{base}/embeddings",
        f"{base}/v1/embeddings",
        f"{base}/api/llm/embeddings",
        f"{base}/api/inference/openai/embeddings",
        f"{base}/openai/v1/embeddings",
        f"{extra_base}/api/llm/embeddings",
        f"{extra_base}/api/llm/v1/embeddings",
        f"{extra_base}/api/inference/openai/embeddings",
    ]
    winner = None
    for url in candidates:
        status, payload = _post_json(url, key, {"model": model, "input": ["ping"]})
        path = url[len(base):] or "/"
        if status == 200:
            dim = len(payload["data"][0]["embedding"]) if isinstance(payload, dict) else "?"
            print(f"   {path:<34} -> 200 OK  (dim={dim})")
            winner = url
        else:
            print(f"   {path:<34} -> {status}")
    if winner:
        print(f"   => USE EMBED_BASE_URL such that endpoint = {winner.rsplit('/embeddings',1)[0]}")
    else:
        print("   => no 200 found. Check base URL / model id / key with the View Code snippet.")


if __name__ == "__main__":
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    loaded = load_env(os.path.join(repo, ".env")) or load_env(os.path.join(repo, ".env.example"))
    print(f"(env loaded: {loaded})\n")
    check_clickhouse()
    print()
    check_embeddings()
