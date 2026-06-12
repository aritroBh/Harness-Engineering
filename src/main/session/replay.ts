import { BrowserWindow, IpcMain } from "electron";
import { safeLog, safeWarn, safeError } from "../logger";
import { waitForMouseAtTarget, waitForUserClickAtTarget } from "../userCursor";
import { loadGraph } from "./storage";
import { Step } from "./types";
import { replayAutoExecute } from "./replayAuto";
import { recordReplayBehavioralEvent } from "../behavioral/tracker";
import { resolveTarget } from "../automation/targetResolver";
import { isPeekabooAvailable } from "../automation/peekabooAdapter";
import {
  createReplayController,
  emitAgentAction,
  isActive,
  releaseReplayController,
  ReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForKeyboardFallback,
  setOverlayForReplay,
  setReplayWindowProvider,
  sleep,
  stopReplay,
} from "./replayController";
import { refreshStepTarget } from "./stepRefresher";
import { assertWalkthroughReplaySafety } from "./replaySafety";
import { validateSender } from "../security/ipcGuards";
import { validateAutomationAction } from "../security/automationGate";

const DEFAULT_STEP_TIMEOUT_MS = 12000;
const DEFAULT_WAIT_STEP_MS = 800;
const MAX_WALKTHROUGH_ATTEMPTS = 2;
const TARGET_APPROACH_TOLERANCE_PX = 50;
const TARGET_CLICK_TOLERANCE_PX = 60;
const MANUAL_CONFIRM_TIMEOUT_MS = 30000;

type TargetWaitResult = "correct" | "timeout" | "cancelled";

let pendingManualConfirm: (() => void) | null = null;

function stepTitle(step: Step): string {
  return (
    step.instruction ||
    step.targetLabel ||
    step.title ||
    step.id ||
    "Untitled step"
  );
}

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS;
}

function waitForUserNearTarget(
  step: Step,
  controller: ReplayController,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve("cancelled");

  return new Promise((resolve) => {
    let settled = false;
    const abort = new AbortController();
    const timeout = setTimeout(
      () => settle(controller.cancelled ? "cancelled" : "timeout"),
      timeoutMs,
    );
    const settle = (result: TargetWaitResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abort.abort();
      controller.cancelHandlers.delete(cancel);
      resolve(result);
    };
    const cancel = () => settle("cancelled");
    controller.cancelHandlers.add(cancel);

    waitForMouseAtTarget(
      step.x,
      step.y,
      TARGET_APPROACH_TOLERANCE_PX,
      timeoutMs,
      abort.signal,
    )
      .then((result) => {
        settle(result);
      })
      .catch((error) => {
        safeError("[USER_CURSOR] waitForMouseAtTarget failed", error);
        settle("timeout");
      });
  });
}

function waitForUserClickOnTarget(
  step: Step,
  controller: ReplayController,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve("cancelled");

  return new Promise((resolve) => {
    let settled = false;
    const abort = new AbortController();
    const timeout = setTimeout(
      () => settle(controller.cancelled ? "cancelled" : "timeout"),
      timeoutMs,
    );
    const settle = (result: TargetWaitResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abort.abort();
      controller.cancelHandlers.delete(cancel);
      resolve(result);
    };
    const cancel = () => settle("cancelled");
    controller.cancelHandlers.add(cancel);

    waitForUserClickAtTarget(
      step.x,
      step.y,
      TARGET_CLICK_TOLERANCE_PX,
      timeoutMs,
      abort.signal,
    )
      .then((result) => {
        settle(result);
      })
      .catch((error) => {
        safeError("[CLICK_DETECT] waitForUserClickAtTarget failed", error);
        settle("timeout");
      });
  });
}

function waitForManualStepConfirmation(
  step: Step,
  index: number,
  total: number,
  controller: ReplayController,
  timeoutMs = MANUAL_CONFIRM_TIMEOUT_MS,
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve("cancelled");

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(
      () => settle(controller.cancelled ? "cancelled" : "timeout"),
      timeoutMs,
    );

    const settle = (result: TargetWaitResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (pendingManualConfirm === confirm) pendingManualConfirm = null;
      controller.cancelHandlers.delete(cancel);
      sendOverlay("replay:confirm-cleared", {});
      setOverlayForReplay();
      resolve(result);
    };

    const confirm = () => settle("correct");
    const cancel = () => settle("cancelled");
    pendingManualConfirm = confirm;
    controller.cancelHandlers.add(cancel);

    safeWarn(
      "[CLICK_DETECT] click fallback armed; waiting for Space/Enter confirmation",
      {
        index,
        x: step.x,
        y: step.y,
        timeoutMs,
      },
    );

    setOverlayForKeyboardFallback();
    sendOverlay("replay:confirm-needed", {
      message: "Click not detected. Press Space to confirm this step.",
      step,
      index,
      total,
      timeoutMs,
    });
  });
}

export function confirmReplayStep(): boolean {
  if (!pendingManualConfirm) {
    safeWarn(
      "[WALKTHROUGH] manual step confirmation ignored; no confirmation is pending",
    );
    return false;
  }

  safeLog("[WALKTHROUGH] manual step confirmation received");
  pendingManualConfirm();
  return true;
}

function stepsForNode(nodeId: string | undefined, appName: string): Step[] {
  const graph = loadGraph(appName);
  const sessions = nodeId
    ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId))
    : graph.sessions.filter((s) => s.steps.length > 0);

  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}

function logWalkthroughStep(
  step: Step,
  index: number,
  total: number,
  attempt: number,
): void {
  safeLog("[WALKTHROUGH] step", {
    index,
    displayIndex: index + 1,
    total,
    attempt,
    title: stepTitle(step),
    action: step.action,
    x: step.x,
    y: step.y,
  });
}

function emitGhostStep(
  step: Step,
  index: number,
  total: number,
  attempt: number,
  reason: TargetWaitResult,
): void {
  const channel = attempt === 0 ? "replay:step" : "replay:retry";

  sendOverlay(channel, {
    step,
    index,
    total,
    reason,
    attempt,
  });

  safeLog("[GHOST] visual step emitted", {
    channel,
    index,
    attempt,
    action: step.action,
    x: step.x,
    y: step.y,
  });
  safeLog("[COORD_FRAME] ghost endpoint", {
    channel,
    index,
    attempt,
    label: step.targetLabel || step.title || step.id,
    sourceFrame: step.sourceFrame,
    coordinateFrame: step.coordinateFrame || "viewport",
    viewport: {
      x: step.viewportX ?? step.x,
      y: step.viewportY ?? step.y,
    },
    rawTarget: step.rawTarget,
    captureBounds: step.captureMeta?.captureBounds,
    displayBounds: step.captureMeta?.displayBounds,
  });
}

function parkGhostAtEndpoint(
  step: Step,
  index: number,
  total: number,
  attempt: number,
): void {
  safeLog("[GHOST] parked at endpoint", {
    index,
    action: step.action,
    x: step.x,
    y: step.y,
  });
  safeLog("[COORD_FRAME] ghost endpoint", {
    index,
    label: step.targetLabel || step.title || step.id,
    sourceFrame: step.sourceFrame,
    coordinateFrame: step.coordinateFrame || "viewport",
    viewport: {
      x: step.viewportX ?? step.x,
      y: step.viewportY ?? step.y,
    },
    rawTarget: step.rawTarget,
    captureBounds: step.captureMeta?.captureBounds,
    displayBounds: step.captureMeta?.displayBounds,
  });
  sendOverlay("replay:target-reached", {
    step,
    index,
    total,
    attempt,
  });
}

export { stopReplay };

export async function replayWalkthrough(
  steps: Step[],
  onStep: (step: Step, index: number) => void,
): Promise<void> {
  assertWalkthroughReplaySafety();

  const controller = createReplayController();
  setOverlayForReplay();
  safeLog("[WALKTHROUGH] start", { totalSteps: steps.length });

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      // Ground the ghost on the *live* screen: re-resolve the step's target
      // label against the frontmost app's accessibility tree so the ghost
      // points at where the element actually is, not where it was when the
      // workflow was saved. Read-only — walkthrough still never moves the
      // real mouse.
      const step = await refreshStepTarget(steps[index], { forceFresh: true });
      if (step.liveResolved) {
        emitAgentAction(`Found "${step.liveMatchedLabel}" on screen`, {
          detail: `match ${Math.round((step.liveConfidence ?? 0) * 100)}% · live coordinates`,
          status: "info",
          stepIndex: index,
        });
      }
      emitAgentAction(`Guiding you: ${stepTitle(step)}`, {
        status: "running",
        stepIndex: index,
      });
      let result: TargetWaitResult = "timeout";
      let attempts = 0;

      while (result !== "correct" && isActive(controller)) {
        logWalkthroughStep(step, index, steps.length, attempts);
        emitGhostStep(step, index, steps.length, attempts, result);

        if (attempts === 0) onStep(step, index);

        if (step.action === "wait") {
          const waitMs = stepWaitMs(step);
          safeLog("[WALKTHROUGH] wait step sleeping", { index, waitMs });
          result = (await sleep(waitMs, controller)) ? "correct" : "cancelled";
        } else if (step.action === "click") {
          const peekabooAvailable = await isPeekabooAvailable();
          const resolved = resolveTarget(step, {
            hasDOM: false,
            peekabooAvailable,
            peekabooTarget: peekabooAvailable
              ? { bbox: { x: step.x, y: step.y } }
              : undefined,
            vlmTarget: {
              confidence: step.targetConfidence ?? 0.8,
              bbox: { x: step.x, y: step.y, width: 0, height: 0 },
            },
            currentApp: step.appName,
          });
          safeLog("[WALKTHROUGH] resolved target", { index, resolved });

          if (resolved.requiresConfirmation) {
            safeWarn("[WALKTHROUGH] Target explicitly requires confirmation.", {
              index,
              resolved,
            });
            // In walkthrough mode, the user handles the confirmation via click or space, so we just proceed to wait for them.
          }

          safeLog("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX,
          });
          result = await waitForUserNearTarget(step, controller);

          if (result === "correct") {
            safeLog("[USER_CURSOR] real cursor entered tolerance", {
              index,
              x: step.x,
              y: step.y,
            });
            parkGhostAtEndpoint(step, index, steps.length, attempts);

            safeLog("[CLICK_DETECT] waiting for actual user click", {
              index,
              x: step.x,
              y: step.y,
              tolerancePx: TARGET_CLICK_TOLERANCE_PX,
            });
            result = await waitForUserClickOnTarget(step, controller);
            if (result === "correct") {
              safeLog("[CLICK_DETECT] Success: User click detected at target", {
                index,
                x: step.x,
                y: step.y,
              });
            } else if (result === "timeout" && isActive(controller)) {
              safeWarn(
                "[CLICK_DETECT] Failed: Click not detected within timeout. Activating Space/Enter fallback.",
              );
              result = await waitForManualStepConfirmation(
                step,
                index,
                steps.length,
                controller,
              );
              if (result === "correct") {
                safeLog(
                  "[CLICK_DETECT] Step advanced by Space/Enter manual confirmation",
                  { index, x: step.x, y: step.y },
                );
              }
            }
          }
        } else {
          safeLog("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            action: step.action,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX,
          });
          result = await waitForUserNearTarget(step, controller);

          if (result === "correct") {
            safeLog("[USER_CURSOR] real cursor entered tolerance", {
              index,
              action: step.action,
              x: step.x,
              y: step.y,
            });
            parkGhostAtEndpoint(step, index, steps.length, attempts);
          }
        }

        if (result === "correct") {
          safeLog("[WALKTHROUGH] step complete", {
            index,
            action: step.action,
            title: stepTitle(step),
          });
          emitAgentAction(`Done: ${stepTitle(step)}`, {
            status: "done",
            stepIndex: index,
          });
        } else if (result === "timeout") {
          attempts++;
          recordReplayBehavioralEvent("retry", stepTitle(step));
          safeWarn("[WALKTHROUGH] step timed out", {
            index,
            action: step.action,
            title: stepTitle(step),
            attempt: attempts,
            maxAttempts: MAX_WALKTHROUGH_ATTEMPTS,
          });
          if (attempts >= MAX_WALKTHROUGH_ATTEMPTS) {
            recordReplayBehavioralEvent("failure", stepTitle(step));
            safeWarn("[WALKTHROUGH] step skipped after timeout", {
              index,
              action: step.action,
              title: stepTitle(step),
            });
            break;
          }
        } else if (result === "cancelled") {
          safeWarn("[WALKTHROUGH] step cancelled", {
            index,
            action: step.action,
            title: stepTitle(step),
          });
          break;
        }
      }
    }

    if (!controller.cancelled) {
      safeLog("[WALKTHROUGH] complete");
      sendOverlay("replay:complete", {});
    }
  } finally {
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[WALKTHROUGH] finished", { cancelled: controller.cancelled });
  }
}

export function registerReplayIpc(
  ipcMain: IpcMain,
  windowProvider: () => BrowserWindow | null,
  appName = "Specter",
): void {
  setReplayWindowProvider(windowProvider);

  ipcMain.handle("replay:walkthrough", async (event, nodeId) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const steps = stepsForNode(nodeId, appName);
    await replayWalkthrough(steps, () => {});
  });

  ipcMain.handle("replay:auto", async (event, nodeId) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const steps = stepsForNode(nodeId, appName);
    if (!validateAutomationAction("replay:auto", steps?.length || 1))
      throw new Error("Automation blocked by gate");
    await replayAutoExecute(steps);
  });

  ipcMain.handle("replay:stop", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    stopReplay();
  });

  ipcMain.handle("replay:confirmStep", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return confirmReplayStep();
  });
}
