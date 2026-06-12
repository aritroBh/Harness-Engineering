/**
 * Real OS-level split-screen for macOS.
 *
 * When Specter is summoned, the user's foreground app should *actually* get
 * out of fullscreen and shrink to the left portion of the display so the
 * progress rail owns the right edge — not just a translucent panel painted
 * over the app. This module does that with the Accessibility API via
 * `osascript` + System Events (the app already requires the Accessibility
 * permission for AX dumps, so no new permission is needed).
 *
 * Design constraints:
 * - Never throw: every entry point resolves to a result object. A failed
 *   split must never break the overlay summon.
 * - Adversarial-safe: the only values interpolated into AppleScript are
 *   integers that have been validated/clamped. App *names* are never
 *   interpolated — processes are located by `unix id` (pid), which sidesteps
 *   quote/emoji/injection problems in app names entirely.
 * - Restorable: the previous window frame (and fullscreen state) is captured
 *   in the same script that resizes, so hiding the overlay puts the user's
 *   window back exactly where it was.
 */

import { execFile } from "child_process";
import { safeLog, safeWarn } from "../logger";

export interface SplitFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SplitScreenResult {
  ok: boolean;
  reason?: string;
  previousFrame?: SplitFrame;
  wasFullscreen?: boolean;
}

interface ActiveSplit {
  pid: number;
  appName: string | null;
  previousFrame: SplitFrame;
  wasFullscreen: boolean;
}

/** Width reserved for the Specter progress rail (360px rail + gutter). */
export const SPLIT_RAIL_WIDTH = 384;

/** Smallest sensible target for the user's app; below this, don't bother. */
const MIN_APP_WIDTH = 480;
const MIN_APP_HEIGHT = 320;

const OSASCRIPT_TIMEOUT_MS = 10_000;

let activeSplit: ActiveSplit | null = null;
let splitInflight: Promise<SplitScreenResult> | null = null;
let warnedAboutAccessibility = false;

/** Integers only — this is the injection barrier for AppleScript. */
export function isValidPid(pid: unknown): pid is number {
  return (
    typeof pid === "number" &&
    Number.isInteger(pid) &&
    pid > 0 &&
    pid < 4_194_304 // pid_max ceiling; anything above is garbage input
  );
}

function toInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Compute where the user's app should sit: the work area minus the rail.
 * Returns null when the display is too small to split meaningfully.
 */
export function computeAppFrame(
  workArea: SplitFrame,
  railWidth: number = SPLIT_RAIL_WIDTH,
): SplitFrame | null {
  if (
    !Number.isFinite(workArea.x) ||
    !Number.isFinite(workArea.y) ||
    !Number.isFinite(workArea.width) ||
    !Number.isFinite(workArea.height)
  ) {
    return null;
  }
  const rail = Math.max(0, toInt(railWidth));
  const width = toInt(workArea.width) - rail;
  const height = toInt(workArea.height);
  if (width < MIN_APP_WIDTH || height < MIN_APP_HEIGHT) return null;
  return { x: toInt(workArea.x), y: toInt(workArea.y), width, height };
}

/**
 * One script does everything atomically: find process by pid, leave
 * fullscreen if needed, capture the previous frame, then apply the new one.
 * Output: "OK:<prevX>,<prevY>,<prevW>,<prevH>,fs=<true|false>" or "ERR:<why>".
 */
export function buildSplitScript(pid: number, frame: SplitFrame): string {
  if (!isValidPid(pid)) throw new Error(`invalid pid: ${String(pid)}`);
  const x = toInt(frame.x);
  const y = toInt(frame.y);
  const w = toInt(frame.width);
  const h = toInt(frame.height);
  return [
    `tell application "System Events"`,
    `  set procs to (every process whose unix id is ${pid})`,
    `  if (count of procs) is 0 then return "ERR:no-process"`,
    `  set p to item 1 of procs`,
    `  if (count of windows of p) is 0 then return "ERR:no-window"`,
    `  set w to window 1 of p`,
    `  set wasFs to false`,
    `  try`,
    `    set wasFs to value of attribute "AXFullScreen" of w`,
    `  end try`,
    `  if wasFs is true then`,
    `    set value of attribute "AXFullScreen" of w to false`,
    `    delay 1.1`,
    `  end if`,
    `  set prevPos to position of w`,
    `  set prevSize to size of w`,
    `  set position of w to {${x}, ${y}}`,
    `  set size of w to {${w}, ${h}}`,
    `  return "OK:" & (item 1 of prevPos) & "," & (item 2 of prevPos) & "," & (item 1 of prevSize) & "," & (item 2 of prevSize) & ",fs=" & wasFs`,
    `end tell`,
  ].join("\n");
}

/** Put the window back. Re-enters fullscreen only if it was fullscreen. */
export function buildRestoreScript(
  pid: number,
  frame: SplitFrame,
  wasFullscreen: boolean,
): string {
  if (!isValidPid(pid)) throw new Error(`invalid pid: ${String(pid)}`);
  const x = toInt(frame.x);
  const y = toInt(frame.y);
  const w = toInt(frame.width);
  const h = toInt(frame.height);
  const lines = [
    `tell application "System Events"`,
    `  set procs to (every process whose unix id is ${pid})`,
    `  if (count of procs) is 0 then return "ERR:no-process"`,
    `  set p to item 1 of procs`,
    `  if (count of windows of p) is 0 then return "ERR:no-window"`,
    `  set w to window 1 of p`,
    `  set position of w to {${x}, ${y}}`,
    `  set size of w to {${w}, ${h}}`,
  ];
  if (wasFullscreen) {
    lines.push(
      `  try`,
      `    set value of attribute "AXFullScreen" of w to true`,
      `  end try`,
    );
  }
  lines.push(`  return "OK"`, `end tell`);
  return lines.join("\n");
}

/** Parse the split script's stdout into a structured result. */
export function parseSplitResult(stdout: string): SplitScreenResult {
  const text = (stdout || "").trim();
  if (text.startsWith("ERR:")) {
    return { ok: false, reason: text.slice(4) || "unknown" };
  }
  if (!text.startsWith("OK:")) {
    return { ok: false, reason: `unexpected-output:${text.slice(0, 60)}` };
  }
  const body = text.slice(3);
  const fsMatch = /,fs=(true|false)\s*$/.exec(body);
  const wasFullscreen = fsMatch ? fsMatch[1] === "true" : false;
  const nums = (fsMatch ? body.slice(0, fsMatch.index) : body)
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10));
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    return { ok: true, wasFullscreen };
  }
  return {
    ok: true,
    wasFullscreen,
    previousFrame: { x: nums[0], y: nums[1], width: nums[2], height: nums[3] },
  };
}

function runOsascript(
  script: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", script],
      { timeout: OSASCRIPT_TIMEOUT_MS, killSignal: "SIGKILL" },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(error, {
              stderr: String(stderr || ""),
            }),
          );
          return;
        }
        resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
      },
    );
  });
}

function classifyOsascriptError(error: unknown): string {
  const message =
    (error as { stderr?: string })?.stderr ||
    (error instanceof Error ? error.message : String(error));
  if (
    /not allowed assistive access|osascript is not allowed|1002/i.test(message)
  ) {
    return "accessibility-denied";
  }
  if (/timed?\s*out|ETIMEDOUT|SIGKILL/i.test(message)) return "timeout";
  return `osascript-error:${message.slice(0, 120)}`;
}

/**
 * Shrink the user's foreground app to the left portion of the work area.
 * Fire-and-forget safe; never throws.
 */
export async function enterSplitScreen(input: {
  pid: number | null | undefined;
  appName?: string | null;
  workArea: SplitFrame;
  railWidth?: number;
}): Promise<SplitScreenResult> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "unsupported-platform" };
  }
  if (!isValidPid(input.pid)) {
    return { ok: false, reason: "invalid-pid" };
  }
  if (splitInflight) return splitInflight;

  const pid = input.pid;
  const frame = computeAppFrame(input.workArea, input.railWidth);
  if (!frame) return { ok: false, reason: "display-too-small" };

  splitInflight = (async (): Promise<SplitScreenResult> => {
    try {
      // Splitting a *different* app while one is already split would strand
      // the first app at half size with no restore path. Put it back first.
      if (activeSplit && activeSplit.pid !== pid) {
        const stranded = activeSplit;
        activeSplit = null;
        await runOsascript(
          buildRestoreScript(
            stranded.pid,
            stranded.previousFrame,
            stranded.wasFullscreen,
          ),
        ).catch(() => undefined);
      }
      const { stdout } = await runOsascript(buildSplitScript(pid, frame));
      const result = parseSplitResult(stdout);
      if (result.ok && result.previousFrame) {
        // Don't clobber the original frame when re-splitting the same app
        // (e.g. user summons twice): keep the first capture for restore.
        if (!activeSplit || activeSplit.pid !== pid) {
          activeSplit = {
            pid,
            appName: input.appName ?? null,
            previousFrame: result.previousFrame,
            wasFullscreen: Boolean(result.wasFullscreen),
          };
        }
        safeLog("[SPLIT_SCREEN] foreground app resized for split view", {
          pid,
          app: input.appName,
          frame,
          wasFullscreen: result.wasFullscreen,
        });
      } else if (!result.ok) {
        safeWarn("[SPLIT_SCREEN] split skipped", {
          pid,
          reason: result.reason,
        });
      }
      return result;
    } catch (error) {
      const reason = classifyOsascriptError(error);
      if (reason === "accessibility-denied" && !warnedAboutAccessibility) {
        warnedAboutAccessibility = true;
        safeWarn(
          "[SPLIT_SCREEN] Accessibility permission denied — grant Specter access in System Settings → Privacy & Security → Accessibility to enable real split-screen",
        );
      } else if (reason !== "accessibility-denied") {
        safeWarn("[SPLIT_SCREEN] split failed", { pid, reason });
      }
      return { ok: false, reason };
    } finally {
      splitInflight = null;
    }
  })();

  return splitInflight;
}

/** Restore the previously split window. Never throws. */
export async function restoreSplitScreen(): Promise<SplitScreenResult> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "unsupported-platform" };
  }
  const split = activeSplit;
  if (!split) return { ok: false, reason: "nothing-to-restore" };
  activeSplit = null;
  try {
    await runOsascript(
      buildRestoreScript(split.pid, split.previousFrame, split.wasFullscreen),
    );
    safeLog("[SPLIT_SCREEN] restored previous window frame", {
      pid: split.pid,
      app: split.appName,
      frame: split.previousFrame,
      wasFullscreen: split.wasFullscreen,
    });
    return { ok: true, previousFrame: split.previousFrame };
  } catch (error) {
    const reason = classifyOsascriptError(error);
    safeWarn("[SPLIT_SCREEN] restore failed", { pid: split.pid, reason });
    return { ok: false, reason };
  }
}

/** Test/diagnostic hook. */
export function getActiveSplit(): ActiveSplit | null {
  return activeSplit;
}

/** Test hook — reset module state between test cases. */
export function __resetSplitScreenStateForTests(): void {
  activeSplit = null;
  splitInflight = null;
  warnedAboutAccessibility = false;
}
