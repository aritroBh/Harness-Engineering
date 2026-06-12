import { BrowserWindow } from "electron";
import { safeLog } from "../logger";

export interface ReplayController {
  cancelled: boolean;
  cancelHandlers: Set<() => void>;
  overlayWasVisible: boolean;
}

let getOverlayWindow: () => BrowserWindow | null = () => null;
let activeReplay: ReplayController | null = null;

export function setReplayWindowProvider(
  windowProvider: () => BrowserWindow | null,
): void {
  getOverlayWindow = windowProvider;
}

export function createReplayController(): ReplayController {
  stopReplay();
  const overlayWindow = getOverlayWindow();
  const controller: ReplayController = {
    cancelled: false,
    cancelHandlers: new Set(),
    overlayWasVisible: Boolean(overlayWindow?.isVisible()),
  };
  activeReplay = controller;
  return controller;
}

function cancelReplay(controller: ReplayController): void {
  if (controller.cancelled) return;
  controller.cancelled = true;
  for (const handler of controller.cancelHandlers) {
    handler();
  }
  controller.cancelHandlers.clear();
}

export function isActive(controller: ReplayController): boolean {
  return activeReplay === controller && !controller.cancelled;
}

export function releaseReplayController(controller: ReplayController): void {
  if (activeReplay === controller) activeReplay = null;
}

export function hasActiveReplay(): boolean {
  return Boolean(activeReplay && !activeReplay.cancelled);
}

export function sleep(
  ms: number,
  controller: ReplayController,
): Promise<boolean> {
  if (controller.cancelled) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => settle(true), ms);
    const settle = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      controller.cancelHandlers.delete(cancel);
      resolve(completed && !controller.cancelled);
    };
    const cancel = () => settle(false);
    controller.cancelHandlers.add(cancel);
  });
}

export function sendOverlay(channel: string, payload: any): void {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const contents = overlayWindow.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send(channel, payload);
}

export type AgentActionStatus = "running" | "done" | "info" | "warn";

export interface AgentActionEvent {
  id: string;
  ts: number;
  /** Short human line, e.g. `Clicking "Create Event"`. */
  label: string;
  /** Optional secondary detail, e.g. `re-grounded on live screen (92%)`. */
  detail?: string;
  status: AgentActionStatus;
  stepIndex?: number;
}

let agentActionSeq = 0;

/**
 * Push a live "what the agent is doing right now" entry to the overlay's
 * right rail. Fire-and-forget; rendering happens in ProgressTracker.
 */
export function emitAgentAction(
  label: string,
  options: {
    detail?: string;
    status?: AgentActionStatus;
    stepIndex?: number;
  } = {},
): void {
  agentActionSeq += 1;
  const event: AgentActionEvent = {
    id: `action-${Date.now()}-${agentActionSeq}`,
    ts: Date.now(),
    label,
    detail: options.detail,
    status: options.status ?? "info",
    stepIndex: options.stepIndex,
  };
  sendOverlay("replay:action", event);
}

export function setOverlayForReplay(): void {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!overlayWindow.isVisible()) {
    overlayWindow.show();
    sendOverlay("overlay:visibility", { visible: true });
  }
  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog("[OVERLAY_INTERACTION] replay starting, enabled click-through");
  }
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
}

export function setOverlayForKeyboardFallback(): void {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!overlayWindow.isVisible()) {
    overlayWindow.show();
    sendOverlay("overlay:visibility", { visible: true });
  }
  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog(
      "[OVERLAY_INTERACTION] keyboard fallback, disabled click-through (interactive mode)",
    );
  }
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.focus();
}

export function restoreOverlayAfterReplay(controller: ReplayController): void {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (controller.overlayWasVisible && overlayWindow.isVisible()) {
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog(
        "[OVERLAY_INTERACTION] replay ended, restoring click-through true",
      );
    }
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    return;
  }

  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog(
      "[OVERLAY_INTERACTION] replay ended, restoring click-through true and hiding overlay",
    );
  }
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.hide();
  sendOverlay("overlay:visibility", { visible: false });
}

export function stopReplay(): void {
  const hadActiveReplay = Boolean(activeReplay);
  if (activeReplay) {
    cancelReplay(activeReplay);
  }
  activeReplay = null;
  if (hadActiveReplay) {
    sendOverlay("replay:stopped", {});
  }
}
