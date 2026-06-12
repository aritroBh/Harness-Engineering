import { spawn } from "child_process";
import { join } from "path";
import { safeLog, safeError } from "./logger";

const DEFAULT_WIKI_ROOT = "./demo-workflows/event-recap/wiki";

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
  const pythonExec = process.env.VIRTUAL_ENV
    ? join(process.env.VIRTUAL_ENV, "bin", "python")
    : "python";

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

  return child;
}
