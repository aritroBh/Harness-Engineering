import { safeLog } from "../logger";
import { clickRealMouse, executeRealMouseSteps } from "../cursor";
import type { BehavioralState, Step } from "./types";
import {
  createReplayController,
  isActive,
  releaseReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForReplay,
  sleep,
} from "./replayController";
import { normalizeBehavioralState } from "../behavioral/model";
import { recordReplayBehavioralEvent } from "../behavioral/tracker";

const DEFAULT_MIRROR_MOVE_MS = 650;
const DEFAULT_MIRROR_WAIT_MS = 620;

function stepWaitMs(step: Step, signature: BehavioralState): number {
  const base = step.waitForMs || step.delayMs || DEFAULT_MIRROR_WAIT_MS;
  return durationForPersona(base, signature);
}

function stepTitle(step: Step): string {
  return (
    step.instruction ||
    step.targetLabel ||
    step.title ||
    step.id ||
    "Untitled step"
  );
}

export function durationForPersona(
  baseMs: number,
  signature: BehavioralState,
): number {
  const state = normalizeBehavioralState(signature);
  const base =
    typeof baseMs === "number" && Number.isFinite(baseMs)
      ? Math.max(120, baseMs)
      : DEFAULT_MIRROR_MOVE_MS;
  const impulsivityFactor = 1.52 - state.impulsivity * 0.98;
  const loadFactor = 1 + state.cognitiveLoad * 0.52;
  const confidenceFactor = 1 - state.decisionConfidence * 0.32;
  const flowFactor = 1 - state.flowScore * 0.12;
  return Math.round(
    Math.min(
      1800,
      Math.max(
        240,
        base * impulsivityFactor * loadFactor * confidenceFactor * flowFactor,
      ),
    ),
  );
}

export async function mirrorReplayExecute(
  steps: Step[],
  signature: BehavioralState,
): Promise<void> {
  const controller = createReplayController();
  const state = normalizeBehavioralState(signature);
  setOverlayForReplay();
  sendOverlay("mirror:started", { total: steps.length, signature: state });
  sendOverlay("spec:mood", "mirroring");
  safeLog("[MIRROR_MODE] STARTING persona-conditioned real OS automation", {
    totalSteps: steps.length,
    impulsivity: state.impulsivity,
    cognitiveLoad: state.cognitiveLoad,
    decisionConfidence: state.decisionConfidence,
  });

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      const moveDurationMs = durationForPersona(DEFAULT_MIRROR_MOVE_MS, state);
      const preDelayMs = durationForPersona(step.delayMs || 120, state);
      sendOverlay("mirror:progress", {
        index,
        total: steps.length,
        step,
        signature: state,
      });
      safeLog("[MIRROR_MODE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y,
        moveDurationMs,
        preDelayMs,
      });

      if (step.action === "wait") {
        if (!(await sleep(stepWaitMs(step, state), controller))) break;
      } else if (step.action === "click") {
        if (!(await sleep(preDelayMs, controller))) break;
        await clickRealMouse(step.x, step.y, moveDurationMs);
      } else {
        if (!(await sleep(preDelayMs, controller))) break;
        await executeRealMouseSteps([{ ...step, delayMs: 0 }], moveDurationMs);
      }

      sendOverlay("replay:progress", { index, total: steps.length, step });
      safeLog("[MIRROR_MODE] real mouse step complete", {
        index,
        action: step.action,
      });
    }

    if (!controller.cancelled) {
      sendOverlay("mirror:complete", { total: steps.length });
      sendOverlay("spec:mood", "celebrating");
    }
  } catch (error) {
    recordReplayBehavioralEvent("failure", "Mirror Mode execution failed");
    sendOverlay("mirror:error", {
      message: error instanceof Error ? error.message : String(error),
    });
    sendOverlay("spec:mood", "stuck");
    throw error;
  } finally {
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[MIRROR_MODE] automation finished", {
      cancelled: controller.cancelled,
    });
  }
}
