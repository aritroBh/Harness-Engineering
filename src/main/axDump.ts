import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { safeError, safeLog, safeWarn } from "./logger";

export interface AxElement {
  i: number;
  role: string;
  title: string;
  desc: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  actionable: boolean;
}

export interface AxDumpResult {
  app: string;
  pid: number;
  elements: AxElement[];
}

export interface FrontmostApp {
  bundleId: string | null;
  name: string | null;
  pid: number | null;
}

export function parseFrontmostJson(text: string): FrontmostApp | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const stringOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  const numberOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const result: FrontmostApp = {
    bundleId: stringOrNull(obj.bundleId),
    name: stringOrNull(obj.name),
    pid: numberOrNull(obj.pid),
  };
  if (!result.bundleId && !result.name) return null;
  return result;
}

export function preferredAppIdentifier(
  app: FrontmostApp | null,
): string | null {
  if (!app) return null;
  return app.bundleId || app.name || null;
}

type Platform = "darwin" | "win32" | "other";

function currentPlatform(): Platform {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "win32") return "win32";
  return "other";
}

let resolvedDarwinBinary: string | null = null;
let resolvedWindowsScript: string | null = null;
let lastError: string | null = null;

function resourcesRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "native");
  }
  return join(__dirname, "..", "..", "resources", "native");
}

function darwinSourcePath(): string {
  return join(resourcesRoot(), "ax-dump.swift");
}

function darwinBundledBinary(): string {
  return join(resourcesRoot(), "build", "ax-dump");
}

function darwinUserDataBinary(): string {
  return join(app.getPath("userData"), "bin", "ax-dump");
}

function windowsScriptPath(): string {
  return join(resourcesRoot(), "ax-dump.ps1");
}

function isExecutable(path: string): boolean {
  try {
    const s = statSync(path);
    return s.isFile() && (s.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function isReadableFile(path: string): boolean {
  try {
    const s = statSync(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function compileDarwinBinary(): string | null {
  const src = darwinSourcePath();
  if (!existsSync(src)) {
    lastError = `ax-dump source not found at ${src}`;
    safeWarn("[AX_DUMP] source missing", { src });
    return null;
  }

  const out = darwinUserDataBinary();
  mkdirSync(join(app.getPath("userData"), "bin"), { recursive: true });

  const result = spawnSync(
    "/usr/bin/xcrun",
    ["swiftc", "-O", "-framework", "Cocoa", src, "-o", out],
    { encoding: "utf8", timeout: 60_000 },
  );

  if (result.status !== 0) {
    lastError = result.stderr?.slice(0, 400) || `swiftc exit ${result.status}`;
    safeError("[AX_DUMP] swiftc failed", {
      status: result.status,
      stderr: lastError,
    });
    return null;
  }

  if (!isExecutable(out)) {
    lastError = `compiled binary not executable: ${out}`;
    safeError("[AX_DUMP] compile produced non-executable", { out });
    return null;
  }

  safeLog("[AX_DUMP] compiled ax-dump", { path: out });
  return out;
}

function ensureDarwinReady(): string | null {
  if (resolvedDarwinBinary && isExecutable(resolvedDarwinBinary)) {
    return resolvedDarwinBinary;
  }

  const bundled = darwinBundledBinary();
  if (isExecutable(bundled)) {
    resolvedDarwinBinary = bundled;
    return resolvedDarwinBinary;
  }

  const cached = darwinUserDataBinary();
  if (isExecutable(cached)) {
    resolvedDarwinBinary = cached;
    return resolvedDarwinBinary;
  }

  const compiled = compileDarwinBinary();
  if (compiled) {
    resolvedDarwinBinary = compiled;
    return resolvedDarwinBinary;
  }

  return null;
}

function ensureWindowsReady(): string | null {
  if (resolvedWindowsScript && isReadableFile(resolvedWindowsScript)) {
    return resolvedWindowsScript;
  }

  const path = windowsScriptPath();
  if (!isReadableFile(path)) {
    lastError = `ax-dump.ps1 not found at ${path}`;
    safeWarn("[AX_DUMP] PowerShell script missing", { path });
    return null;
  }

  // Quick smoke test that powershell.exe is on PATH. Actual permission for
  // UI Automation does not require any extra grant on Windows.
  const probe = spawnSync(
    "powershell.exe",
    ["-Command", "$PSVersionTable.PSVersion.Major"],
    {
      encoding: "utf8",
      timeout: 5_000,
    },
  );
  if (probe.status !== 0) {
    lastError = `powershell.exe probe exit ${probe.status}: ${probe.stderr?.slice(0, 200) || ""}`;
    safeWarn("[AX_DUMP] PowerShell probe failed", { lastError });
    return null;
  }

  resolvedWindowsScript = path;
  safeLog("[AX_DUMP] PowerShell helper ready", {
    path,
    psMajor: probe.stdout.trim(),
  });
  return resolvedWindowsScript;
}

export function ensureAxDumpReady(): string | null {
  const platform = currentPlatform();
  if (platform === "darwin") return ensureDarwinReady();
  if (platform === "win32") return ensureWindowsReady();
  lastError = `ax-dump unsupported on platform ${process.platform}`;
  return null;
}

export function getAxDumpStatus(): {
  ready: boolean;
  platform: Platform;
  path: string | null;
  lastError: string | null;
} {
  const platform = currentPlatform();
  const path =
    platform === "darwin"
      ? resolvedDarwinBinary
      : platform === "win32"
        ? resolvedWindowsScript
        : null;
  return {
    ready: path !== null,
    platform,
    path,
    lastError,
  };
}

interface SpawnConfig {
  command: string;
  args: string[];
}

function buildSpawnConfig(
  platform: Platform,
  helper: string,
  appIdentifier?: string,
): SpawnConfig | null {
  const argv = appIdentifier ? [appIdentifier] : [];
  if (platform === "darwin") {
    return { command: helper, args: argv };
  }
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helper,
        ...argv,
      ],
    };
  }
  return null;
}

function buildFrontmostSpawnConfig(
  platform: Platform,
  helper: string,
): SpawnConfig | null {
  if (platform === "darwin") {
    return { command: helper, args: ["--frontmost-only"] };
  }
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helper,
        "--frontmost-only",
      ],
    };
  }
  return null;
}

export async function getFrontmostApp(
  timeoutMs?: number,
): Promise<FrontmostApp | null> {
  const platform = currentPlatform();
  const helper = ensureAxDumpReady();
  if (!helper) {
    safeWarn("[AX_DUMP] frontmost probe skipped — helper unavailable", {
      platform,
    });
    return null;
  }

  const spawnConfig = buildFrontmostSpawnConfig(platform, helper);
  if (!spawnConfig) {
    return null;
  }

  // The probe is a tight stat-and-exit on darwin (~10ms) but PowerShell on
  // Windows always pays a cold-start tax. Default generously on win32 so the
  // first probe doesn't drop on a slow machine.
  const effectiveTimeout = timeoutMs ?? (platform === "win32" ? 8_000 : 1_500);

  return new Promise((resolve) => {
    const child = spawn(spawnConfig.command, spawnConfig.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      safeWarn("[AX_DUMP] frontmost probe timeout", {
        platform,
        timeoutMs: effectiveTimeout,
      });
      resolve(null);
    }, effectiveTimeout);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      safeError("[AX_DUMP] frontmost probe spawn error", {
        platform,
        error: err.message,
      });
      resolve(null);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        safeWarn("[AX_DUMP] frontmost probe non-zero exit", {
          platform,
          code,
          stderr: stderr.slice(0, 200),
        });
        resolve(null);
        return;
      }
      const parsed = parseFrontmostJson(stdout);
      if (!parsed) {
        safeWarn("[AX_DUMP] frontmost probe returned unparseable output", {
          preview: stdout.slice(0, 200),
        });
      }
      resolve(parsed);
    });
  });
}

export async function dumpAxElements(
  appIdentifier?: string,
  timeoutMs?: number,
): Promise<AxDumpResult | null> {
  const platform = currentPlatform();
  const helper = ensureAxDumpReady();
  if (!helper) {
    safeWarn("[AX_DUMP] helper unavailable; skipping dump", {
      platform,
    });
    return null;
  }

  const spawnConfig = buildSpawnConfig(platform, helper, appIdentifier);
  if (!spawnConfig) {
    safeWarn("[AX_DUMP] no spawn config for platform", { platform });
    return null;
  }

  // PowerShell cold start is slower than the compiled Swift binary. Default
  // generously on Windows so the first invocation does not get killed before
  // .NET assemblies finish loading.
  const effectiveTimeout = timeoutMs ?? (platform === "win32" ? 12_000 : 4_000);

  return new Promise((resolve) => {
    const child = spawn(spawnConfig.command, spawnConfig.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      safeWarn("[AX_DUMP] timeout", {
        app: appIdentifier,
        platform,
        timeoutMs: effectiveTimeout,
      });
      resolve(null);
    }, effectiveTimeout);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      safeError("[AX_DUMP] spawn error", { error: err.message, platform });
      resolve(null);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        safeWarn("[AX_DUMP] non-zero exit", {
          code,
          platform,
          stderr: stderr.slice(0, 200),
        });
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as AxDumpResult;
        if (!parsed || !Array.isArray(parsed.elements)) {
          safeWarn("[AX_DUMP] malformed JSON shape");
          resolve(null);
          return;
        }
        resolve(parsed);
      } catch (err: any) {
        safeError("[AX_DUMP] parse error", {
          message: err?.message,
          platform,
          preview: stdout.slice(0, 200),
        });
        resolve(null);
      }
    });
  });
}
