import { spawn } from "child_process";
import * as os from "os";

export interface PeekabooResult {
  ok: boolean;
  warnings: string[];
  result?: any;
  raw?: string;
}

const DEFAULT_TIMEOUT_MS = 10000;

function getTimeoutMs(): number {
  if (process.env.PEEKABOO_TIMEOUT_MS) {
    const parsed = parseInt(process.env.PEEKABOO_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function isMac(): boolean {
  return os.platform() === "darwin";
}

function getPeekabooBin(): string {
  return process.env.PEEKABOO_BIN || "peekaboo";
}

function getUsePeekabooEnv(): boolean {
  if (process.env.USE_PEEKABOO === "false") return false;
  if (process.env.USE_PEEKABOO === "true") return true;
  return isMac();
}

export async function isPeekabooAvailable(): Promise<boolean> {
  const status = await getPeekabooStatus();
  return status.available;
}

function executePeekabooCommand(
  args: string[],
  timeoutMs: number = getTimeoutMs(),
): Promise<PeekabooResult> {
  return new Promise((resolve) => {
    if (!isMac()) {
      return resolve({
        ok: false,
        warnings: ["Peekaboo disabled: non-macOS platform"],
      });
    }

    if (!getUsePeekabooEnv()) {
      return resolve({
        ok: false,
        warnings: ["Peekaboo disabled via environment"],
      });
    }

    let stdoutData = "";
    let stderrData = "";

    const child = spawn(getPeekabooBin(), args, { shell: false });

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        warnings: [`Peekaboo command timed out after ${timeoutMs}ms`],
      });
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as any).code === "ENOENT") {
        resolve({
          ok: false,
          warnings: ["Peekaboo binary missing on PATH"],
        });
      } else {
        resolve({
          ok: false,
          warnings: [`Failed to spawn peekaboo: ${err.message}`],
        });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        return resolve({
          ok: false,
          warnings: [`Command exited with code ${code}`, stderrData],
        });
      }

      // If json parsing is expected based on args
      if (args.includes("--json")) {
        try {
          const parsed = JSON.parse(stdoutData.trim());
          return resolve({ ok: true, warnings: [], result: parsed });
        } catch (e) {
          return resolve({
            ok: false,
            warnings: ["Invalid Peekaboo JSON output"],
            raw: stdoutData,
          });
        }
      }

      resolve({
        ok: true,
        warnings: [],
        raw: stdoutData,
      });
    });
  });
}

export async function getPeekabooStatus(): Promise<{
  enabled: boolean;
  available: boolean;
  platform: string;
  warning?: string;
}> {
  if (!isMac()) {
    return {
      enabled: false,
      available: false,
      platform: os.platform(),
      warning: "Peekaboo is only supported on macOS",
    };
  }

  const enabled = getUsePeekabooEnv();
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      platform: "darwin",
      warning: "Peekaboo is disabled via environment",
    };
  }

  // Check binary exists
  const versionRes = await executePeekabooCommand(["--version"]);
  if (!versionRes.ok) {
    return {
      enabled: true,
      available: false,
      platform: "darwin",
      warning:
        "Peekaboo binary is missing. Install with: brew install steipete/tap/peekaboo",
    };
  }

  // Try to check permissions
  let res = await executePeekabooCommand(["permissions", "status", "--json"]);
  if (!res.ok) {
    // Fallback to non-json
    const fallbackRes = await executePeekabooCommand(["permissions", "status"]);
    if (!fallbackRes.ok) {
      return {
        enabled: true,
        available: false,
        platform: "darwin",
        warning: res.warnings.join("; "),
      };
    }
    res = fallbackRes;
  }

  const permissionsOk = res.result
    ? res.result.ScreenRecording && res.result.Accessibility
    : res.raw &&
      res.raw.includes("Screen Recording") &&
      res.raw.includes("Accessibility") &&
      !res.raw.includes("missing") &&
      !res.raw.includes("denied");

  if (!permissionsOk) {
    return {
      enabled: true,
      available: false,
      platform: "darwin",
      warning:
        "Missing macOS permissions. Check Screen Recording and Accessibility.",
    };
  }

  return {
    enabled: true,
    available: true,
    platform: "darwin",
  };
}

export async function captureSnapshot(
  appName?: string,
): Promise<PeekabooResult> {
  const args = ["see", "--json"];
  if (appName) {
    args.push("--app", appName);
  }
  return executePeekabooCommand(args);
}

export type PeekabooClickTarget =
  | { kind: "element"; target: string; snapshotId?: string }
  | { kind: "coords"; x: number; y: number };

export async function clickTarget(
  target: PeekabooClickTarget,
): Promise<PeekabooResult> {
  if (target.kind === "element") {
    if (target.snapshotId) {
      return executePeekabooCommand([
        "click",
        "--on",
        target.target,
        "--snapshot",
        target.snapshotId,
        "--json",
      ]);
    } else {
      const snapRes = await executePeekabooCommand(["see", "--json"]);
      if (!snapRes.ok || !snapRes.result || !snapRes.result.snapshotId) {
        return {
          ok: false,
          warnings: ["Failed to extract snapshot id from peekaboo see --json"],
        };
      }
      return executePeekabooCommand([
        "click",
        "--on",
        target.target,
        "--snapshot",
        snapRes.result.snapshotId,
        "--json",
      ]);
    }
  } else if (target.kind === "coords") {
    return executePeekabooCommand([
      "click",
      "--coords",
      `${target.x},${target.y}`,
      "--json",
    ]);
  }
  return { ok: false, warnings: ["Invalid click target"] };
}

export async function typeText(text: string): Promise<PeekabooResult> {
  return executePeekabooCommand(["type", "--text", text, "--json"]);
}

export async function pressHotkey(keys: string): Promise<PeekabooResult> {
  const helpRes = await executePeekabooCommand(["hotkey", "--help"]);
  if (
    !helpRes.ok ||
    !helpRes.raw ||
    (!helpRes.raw.includes("hotkey") && !helpRes.raw.includes("USAGE"))
  ) {
    return { ok: false, warnings: ["Peekaboo hotkey unavailable"] };
  }
  return executePeekabooCommand(["hotkey", keys, "--json"]);
}

export async function scrollTarget(
  target: string,
  direction: "up" | "down" | "left" | "right",
): Promise<PeekabooResult> {
  return executePeekabooCommand([
    "scroll",
    "--on",
    target,
    "--direction",
    direction,
    "--json",
  ]);
}
