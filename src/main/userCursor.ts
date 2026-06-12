import { mouse } from "@nut-tree-fork/nut-js";
import { uIOhook } from "uiohook-napi";
import type { UiohookMouseEvent } from "uiohook-napi";
import {
  COORDINATE_MODE,
  getPrimaryDisplayMetrics,
  screenPointToPercent,
  toScreenPoint,
} from "./screenCoordinates";
import { safeLog, safeWarn } from "./logger";

type TargetWaitResult = "correct" | "timeout" | "cancelled";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userCursorPermissionError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Specter could not monitor the macOS cursor. Grant Accessibility and Input Monitoring permissions to this app in System Settings > Privacy & Security, then retry. Original error: ${detail}`,
  );
}

export async function getMousePosition(): Promise<{ x: number; y: number }> {
  try {
    const pos = await mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}

export async function getMousePercent(): Promise<{ x: number; y: number }> {
  try {
    const pos = await mouse.getPosition();
    return screenPointToPercent(pos.x, pos.y);
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}

export async function getCoordinateCalibrationDiagnostics(): Promise<any> {
  try {
    const currentMousePosition = await mouse.getPosition();
    const computedPercent = screenPointToPercent(
      currentMousePosition.x,
      currentMousePosition.y,
    );
    const centerTarget = await toScreenPoint(50, 50);
    const metrics = getPrimaryDisplayMetrics();
    const diagnostics = {
      primaryDisplay: metrics,
      currentMousePosition: {
        x: currentMousePosition.x,
        y: currentMousePosition.y,
      },
      computedPercent,
      toScreenPoint50_50: {
        x: centerTarget.x,
        y: centerTarget.y,
      },
      expectedCenter: {
        x: Math.round(
          metrics.activeDisplay.bounds.x +
            metrics.activeDisplay.bounds.width / 2,
        ),
        y: Math.round(
          metrics.activeDisplay.bounds.y +
            metrics.activeDisplay.bounds.height / 2,
        ),
      },
      coordinateMode: COORDINATE_MODE,
    };

    safeLog("[COORD_CALIBRATION]", diagnostics);
    return diagnostics;
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}

export async function waitForMouseAtTarget(
  targetPercentX: number,
  targetPercentY: number,
  tolerancePx: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<TargetWaitResult> {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) return "cancelled";
      const pos = await mouse.getPosition();
      const dx = pos.x - target.x;
      const dy = pos.y - target.y;

      if (Math.hypot(dx, dy) <= tolerancePx) {
        safeLog("[USER_CURSOR] entered target tolerance", {
          targetPercentX,
          targetPercentY,
          tolerancePx,
          cursorX: pos.x,
          cursorY: pos.y,
        });
        return "correct";
      }
      await sleep(100);
    }
    safeWarn("[USER_CURSOR] target tolerance wait timed out", {
      targetPercentX,
      targetPercentY,
      tolerancePx,
      timeoutMs,
    });
    return "timeout";
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}

async function currentMousePositionOrEvent(
  event: UiohookMouseEvent,
): Promise<{ x: number; y: number }> {
  try {
    const pos = await mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch {
    return { x: event.x, y: event.y };
  }
}

export async function waitForUserClickAtTarget(
  targetPercentX: number,
  targetPercentY: number,
  tolerancePx: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<TargetWaitResult> {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY);

    return await new Promise<TargetWaitResult>((resolve) => {
      let settled = false;
      const timeout = setTimeout(
        () => settle(signal?.aborted ? "cancelled" : "timeout"),
        timeoutMs,
      );

      const settle = (result: TargetWaitResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        uIOhook.off("click", onClick);
        signal?.removeEventListener("abort", onAbort);
        if (result === "timeout") {
          safeWarn("[CLICK_DETECT] timed out waiting for user click", {
            targetPercentX,
            targetPercentY,
            tolerancePx,
            timeoutMs,
          });
        }
        resolve(result);
      };

      const onAbort = () => settle("cancelled");
      const onClick = (event: UiohookMouseEvent) => {
        void currentMousePositionOrEvent(event)
          .then((pos) => {
            const dx = pos.x - target.x;
            const dy = pos.y - target.y;
            const distancePx = Math.hypot(dx, dy);
            safeLog("[CLICK_DETECT] click observed", {
              targetPercentX,
              targetPercentY,
              tolerancePx,
              cursorX: pos.x,
              cursorY: pos.y,
              distancePx,
            });
            if (distancePx <= tolerancePx) {
              safeLog("[CLICK_DETECT] click detected inside target tolerance", {
                targetPercentX,
                targetPercentY,
                tolerancePx,
              });
              settle("correct");
            }
          })
          .catch(() => undefined);
      };

      if (signal?.aborted) {
        settle("cancelled");
        return;
      }

      safeLog("[CLICK_DETECT] armed user click detector", {
        targetPercentX,
        targetPercentY,
        tolerancePx,
        timeoutMs,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      uIOhook.on("click", onClick);
    });
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
