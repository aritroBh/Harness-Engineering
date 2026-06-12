import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { safeLog, safeError } from "./logger";

// User's real GhostWiki directory under Application Support (created on first run)
export const DEFAULT_WIKI_ROOT = (() => {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return join(home, "Library/Application Support/Specter/GhostWiki");
})();

export function memoryServicePort(): string {
  return process.env.MEMORY_SERVICE_PORT || "8765";
}

export async function postToMemoryService<T extends Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const port = memoryServicePort();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Memory service ${path} failed: HTTP ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

async function isSidecarHealthy(port: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startMemorySidecar() {
  const port = process.env.MEMORY_SERVICE_PORT || "8765";
  const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT;

  // A sidecar from a previous dev session may still own the port; binding
  // again would crash-loop uvicorn with EADDRINUSE while requests keep
  // hitting the old process. Reuse it instead. The confirmation probe after a
  // short delay guards against the dev-restart race where the previous app
  // instance is mid-shutdown and about to take its sidecar down with it.
  if (await isSidecarHealthy(port)) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await isSidecarHealthy(port)) {
      safeLog("[GhostWiki] Memory sidecar already running, reusing", { port });
      return null;
    }
    safeLog("[GhostWiki] Sidecar died during reuse check, spawning fresh");
  }
  const venvPython = join(process.cwd(), "memory_service", ".venv", "bin", "python");
  const pythonExec = process.env.VIRTUAL_ENV
    ? join(process.env.VIRTUAL_ENV, "bin", "python")
    : existsSync(venvPython)
      ? venvPython
      : "python3";

  safeLog("[GhostWiki] Starting memory sidecar on port", {
    port,
    pythonExec,
    wikiRoot,
  });

  const child = spawn(
    pythonExec,
    [
      "-m",
      "uvicorn",
      "memory_service.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
        GHOSTWIKI_WIKI_ROOT: wikiRoot,
      },
    },
  );

  child.stdout.on("data", (data) => {
    safeLog("[MemoryService]", { out: data.toString().trim() });
  });

  child.stderr.on("data", (data) => {
    safeError("[MemoryService]", { err: data.toString().trim() });
  });

  child.on("close", (code) => {
    safeLog(`[MemoryService] Exited with code ${code}`);
  });

  await waitForSidecarReady(port);
  return child;
}

export async function waitForSidecarReady(
  port = process.env.MEMORY_SERVICE_PORT || "8765",
  maxAttempts = 15,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isSidecarHealthy(port)) {
      safeLog("[GhostWiki] Memory sidecar ready", { port, attempt: attempt + 1 });
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  safeError("[GhostWiki] Memory sidecar failed readiness check", { port });
  return false;
}
