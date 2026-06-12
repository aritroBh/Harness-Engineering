import { spawn } from "child_process";
import { existsSync } from "fs";
import { safeLog, safeWarn, safeError } from "./logger";

const OPENARA_BIN = "/Applications/Ara.app/Contents/MacOS/openara";

export interface OpenaraResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface OpenaraToolResult {
  isError: boolean;
  text: string;
  raw: any;
}

let openaraAvailability: boolean | null = null;
let permissionsOk: boolean | null = null;

export function isOpenaraInstalled(): boolean {
  if (openaraAvailability !== null) return openaraAvailability;
  openaraAvailability = existsSync(OPENARA_BIN);
  if (!openaraAvailability) {
    safeWarn(
      "[OPENARA] /Applications/Ara.app/Contents/MacOS/openara not found",
    );
  }
  return openaraAvailability;
}

function runOpenara(args: string[], timeoutMs = 5000): Promise<OpenaraResult> {
  return new Promise((resolve) => {
    const child = spawn(OPENARA_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve({ ok: false, stdout, stderr, exitCode: null });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stderr += `\n${err.message}`;
      resolve({ ok: false, stdout, stderr, exitCode: null });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr, exitCode: code });
    });
  });
}

function parseToolResult(stdout: string): OpenaraToolResult {
  try {
    const parsed = JSON.parse(stdout);
    const text = Array.isArray(parsed?.content)
      ? parsed.content
          .filter((c: any) => c?.type === "text" && typeof c.text === "string")
          .map((c: any) => c.text)
          .join("\n")
      : "";
    return {
      isError: parsed?.isError === true,
      text,
      raw: parsed,
    };
  } catch (err) {
    return { isError: true, text: stdout, raw: null };
  }
}

export async function ensureOpenaraPermissions(): Promise<boolean> {
  if (permissionsOk !== null) return permissionsOk;
  if (!isOpenaraInstalled()) {
    permissionsOk = false;
    return false;
  }
  const result = await runOpenara(["doctor"], 4000);
  const ok =
    result.ok &&
    /accessibility=granted/.test(result.stdout) &&
    /screenRecording=granted/.test(result.stdout);
  if (!ok) {
    safeWarn("[OPENARA] permissions not ready", {
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 200),
    });
  }
  permissionsOk = ok;
  return ok;
}

export async function getFocusedAppBundleId(): Promise<string | null> {
  if (!isOpenaraInstalled()) return null;
  const result = await runOpenara(["list-apps"], 3000);
  if (!result.ok) return null;
  const firstRunning = result.stdout
    .split("\n")
    .find((line) => /\[running/.test(line));
  if (!firstRunning) return null;
  const bundleMatch = firstRunning.match(/—\s+([\w.-]+)\s+\[/);
  return bundleMatch ? bundleMatch[1] : null;
}

/**
 * Click at a screen pixel via Ara. Routes the request through `get_app_state`
 * (so Ara has a fresh accessibility session) and then `click` with the screen
 * pixel converted to window-local coordinates is brittle, so we ask Ara to
 * click using the system-wide pixel directly when it knows the focused app.
 *
 * Returns true on success. Caller should fall back to nut-js on false.
 */
export async function clickAtScreenPixel(
  screenX: number,
  screenY: number,
  app?: string,
): Promise<boolean> {
  if (!(await ensureOpenaraPermissions())) return false;

  const targetApp = app || (await getFocusedAppBundleId());
  if (!targetApp) {
    safeWarn("[OPENARA] no focused app for click");
    return false;
  }

  const calls = JSON.stringify([
    { tool: "get_app_state", args: { app: targetApp } },
    {
      tool: "click",
      args: {
        app: targetApp,
        x: Math.round(screenX),
        y: Math.round(screenY),
      },
    },
  ]);

  const result = await runOpenara(
    ["call", "--calls", calls, "--sleep", "0"],
    7000,
  );

  if (!result.ok) {
    safeWarn("[OPENARA] click failed", {
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 300),
    });
    return false;
  }

  const trailing = result.stdout
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{"));

  if (!trailing) {
    safeWarn("[OPENARA] click stdout missing JSON result");
    return false;
  }

  const parsed = parseToolResult(trailing);
  if (parsed.isError) {
    safeWarn("[OPENARA] click reported error", {
      text: parsed.text.slice(0, 200),
    });
    return false;
  }

  safeLog("[OPENARA] click succeeded", {
    app: targetApp,
    screenX: Math.round(screenX),
    screenY: Math.round(screenY),
  });
  return true;
}

export async function clickElementByIndex(
  app: string,
  elementIndex: string,
): Promise<boolean> {
  if (!(await ensureOpenaraPermissions())) return false;
  const calls = JSON.stringify([
    { tool: "get_app_state", args: { app } },
    {
      tool: "click",
      args: { app, element_index: String(elementIndex) },
    },
  ]);
  const result = await runOpenara(
    ["call", "--calls", calls, "--sleep", "0"],
    7000,
  );
  if (!result.ok) {
    safeWarn("[OPENARA] clickElementByIndex failed", {
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 300),
    });
    return false;
  }
  const trailing = result.stdout
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!trailing) return true;
  const parsed = parseToolResult(trailing);
  if (parsed.isError) {
    safeWarn("[OPENARA] clickElementByIndex reported error", {
      text: parsed.text.slice(0, 200),
    });
    return false;
  }
  return true;
}

export interface OpenaraAppState {
  app: string;
  axTree: string;
  screenshotBase64: string | null;
  screenshotMime: string | null;
}

export async function getAppState(
  app?: string,
): Promise<OpenaraAppState | null> {
  if (!(await ensureOpenaraPermissions())) return null;

  const targetApp = app || (await getFocusedAppBundleId());
  if (!targetApp) {
    safeWarn("[OPENARA] no focused app for getAppState");
    return null;
  }

  const result = await runOpenara(
    ["call", "get_app_state", "--args", JSON.stringify({ app: targetApp })],
    8000,
  );

  if (!result.ok) {
    safeWarn("[OPENARA] getAppState failed", {
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 300),
    });
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    safeWarn("[OPENARA] getAppState returned non-JSON stdout");
    return null;
  }

  if (parsed?.isError === true) {
    safeWarn("[OPENARA] getAppState reported error", {
      text: JSON.stringify(parsed?.content).slice(0, 200),
    });
    return null;
  }

  const items: any[] = Array.isArray(parsed?.content) ? parsed.content : [];
  const axTreeItem = items.find(
    (c) => c?.type === "text" && typeof c.text === "string",
  );
  const imageItem = items.find(
    (c) => c?.type === "image" && typeof c.data === "string",
  );

  if (!axTreeItem) {
    safeWarn("[OPENARA] getAppState missing AX text content");
    return null;
  }

  return {
    app: targetApp,
    axTree: axTreeItem.text,
    screenshotBase64: imageItem ? imageItem.data : null,
    screenshotMime: imageItem
      ? typeof imageItem.mimeType === "string"
        ? imageItem.mimeType
        : "image/png"
      : null,
  };
}

/**
 * Test entry point. Logs whether Ara is reachable; called from main on startup
 * so we surface availability in logs without forcing first-click latency.
 */
export async function probeOpenaraOnStartup(): Promise<void> {
  if (!isOpenaraInstalled()) {
    safeLog("[OPENARA] Ara CLI not installed; using nut-js fallback only");
    return;
  }
  const ok = await ensureOpenaraPermissions();
  safeLog(`[OPENARA] startup probe: permissions ${ok ? "granted" : "missing"}`);
  if (ok) {
    try {
      const app = await getFocusedAppBundleId();
      safeLog("[OPENARA] focused app at startup", { app });
    } catch (err) {
      safeError("[OPENARA] focused app probe failed", err);
    }
  }
}
