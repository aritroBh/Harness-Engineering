/**
 * Live step target refresher.
 *
 * Saved workflow steps carry display-percent coordinates frozen at save
 * time (the demo fixture's are hand-authored). The moment the target app
 * moves, resizes (split-screen does exactly that), or scrolls, those
 * percentages point at the wrong pixels — which is why replays "click the
 * wrong thing".
 *
 * This module re-grounds every step against what is *actually on screen
 * right now*: it walks the frontmost app's accessibility tree (the same
 * screen-reader data the OS exposes) and fuzzy-matches the step's
 * `targetLabel`. When a confident match is found, the step's coordinates
 * are replaced with the element's live position. When not, the stored
 * coordinates remain as a best-effort fallback.
 *
 * Read-only: no mouse, no keyboard — safe to use from walkthrough mode
 * (replaySafety only forbids real-input calls).
 */

import { safeLog } from "../logger";
import {
  invalidateLiveTargetCache,
  resolveLiveTarget,
} from "../automation/liveTargetResolver";
import type { Step } from "./types";

/** Minimum fuzzy-match score before we trust a live element over stored coords. */
const MIN_LIVE_CONFIDENCE = 0.45;

export interface RefreshedStep extends Step {
  /** True when coordinates were re-grounded against the live AX tree. */
  liveResolved?: boolean;
  /** Fuzzy-match score of the live resolution (0..1). */
  liveConfidence?: number;
  /** Label of the element actually matched on screen. */
  liveMatchedLabel?: string;
}

function liveAction(step: Step): "click" | "type" | "scroll" | "wait" {
  if (
    step.action === "click" ||
    step.action === "type" ||
    step.action === "scroll"
  ) {
    return step.action;
  }
  return "wait";
}

/**
 * Re-ground one step against the live screen. Never throws; returns the
 * original step (copy) when resolution isn't possible.
 *
 * @param forceFresh dump a fresh AX tree instead of using the short cache —
 *   pass true between auto-executed steps, since each click mutates the UI.
 */
export async function refreshStepTarget(
  step: Step,
  options: { forceFresh?: boolean } = {},
): Promise<RefreshedStep> {
  const label = (step.targetLabel || "").trim();
  if (!label || step.action === "wait") return { ...step };

  try {
    if (options.forceFresh) invalidateLiveTargetCache();
    const resolved = await resolveLiveTarget(label, liveAction(step));
    if (!resolved) return { ...step };
    if ((resolved.confidence ?? 0) < MIN_LIVE_CONFIDENCE) {
      safeLog("[STEP_REFRESH] live match too weak, keeping stored coords", {
        targetLabel: label,
        confidence: resolved.confidence,
      });
      return { ...step };
    }

    safeLog("[STEP_REFRESH] re-grounded step against live screen", {
      targetLabel: label,
      matched: resolved.label,
      stored: { x: step.x, y: step.y },
      live: { x: resolved.viewportX, y: resolved.viewportY },
      confidence: Number((resolved.confidence ?? 0).toFixed(3)),
    });

    return {
      ...step,
      x: resolved.viewportX,
      y: resolved.viewportY,
      viewportX: resolved.viewportX,
      viewportY: resolved.viewportY,
      coordinateFrame: "viewport",
      liveResolved: true,
      liveConfidence: resolved.confidence,
      liveMatchedLabel: resolved.label,
    };
  } catch {
    // AX helper unavailable / permission denied — stored coords still work
    // as the fallback, exactly as before.
    return { ...step };
  }
}
