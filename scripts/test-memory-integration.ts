/**
 * End-to-end memory integration test (no Electron UI).
 * Run: npx ts-node --transpile-only scripts/test-memory-integration.ts
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const WIKI_ROOT = "./demo-workflows/event-recap/wiki";
const PORT = process.env.MEMORY_SERVICE_PORT || "8765";
const BASE = `http://127.0.0.1:${PORT}`;

let failed = 0;
let child: ReturnType<typeof spawn> | null = null;
let startedChild = false;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log("PASS", label);
  } else {
    failed += 1;
    console.error("FAIL", label);
  }
}

async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(maxMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await healthOk()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Memory service not healthy on port ${PORT}`);
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function main() {
  console.log("== Memory integration test ==");

  if (!(await healthOk())) {
    const python =
      process.env.VIRTUAL_ENV
        ? join(process.env.VIRTUAL_ENV, "bin", "python")
        : existsSync("memory_service/.venv/bin/python")
          ? "memory_service/.venv/bin/python"
          : "python3";
    child = spawn(
      python,
      ["-m", "uvicorn", "memory_service.app:app", "--host", "127.0.0.1", "--port", PORT],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONPATH: process.cwd(),
          COGNEE_ENABLED: "false",
          GHOSTWIKI_WIKI_ROOT: WIKI_ROOT,
        },
        stdio: "ignore",
      },
    );
    startedChild = true;
    await waitForHealth();
  }

  const health = await (await fetch(`${BASE}/health`)).json();
  check("health status ok", health.status === "ok");
  check("wiki_root aligned", health.wiki_root === WIKI_ROOT);
  check("fallback mode", health.cognee_enabled === false);

  const ingest = await postJson<{ ok: boolean; sources_ingested: number }>("/ingest", {
    files: [],
  });
  check("ingest ok", ingest.ok === true);
  check("ingest found demo pages", ingest.sources_ingested >= 4);

  const query = await postJson<{ ok: boolean; answer: string; sources: unknown[] }>(
    "/query",
    { query: "How do I create a calendar event from this event page?" },
  );
  check("query ok", query.ok === true);
  check("query has sources", query.sources.length > 0);
  check(
    "query has procedural steps",
    query.answer.toLowerCase().includes("create event") &&
      query.answer.toLowerCase().includes("title"),
  );

  const lint = await postJson<{ ok: boolean; issues: unknown[] }>("/lint", {});
  check("lint ok", lint.ok === true);
  check("lint finds issues", lint.issues.length > 0);

  const pages = await (await fetch(`${BASE}/wiki/pages`)).json();
  check("wiki pages listed", Array.isArray(pages.pages) && pages.pages.length >= 4);

  // Adversarial: empty query body should 422
  const badRes = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check("malformed query rejected", badRes.status === 422);

  console.log(`\n${failed === 0 ? "All" : failed} memory integration check(s) ${failed === 0 ? "passed" : "failed"}`);
  if (startedChild && child) {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Memory integration test crashed:", err);
  if (startedChild && child) child.kill();
  process.exit(1);
});
