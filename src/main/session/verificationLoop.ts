/**
 * Verification loop (Part A / A4 / M3).
 *
 * Watches what the user actually does and decides whether they completed the
 * current step, did the wrong thing, or nothing relevant happened:
 *   AX event → observed interaction → evaluate vs current step
 *     match    → advanceStep()       (tutorSession plans the next step)
 *     mismatch → writeCorrection()   → correctStep(message)
 *     ignore   → wait (debounce / timeout nudge)
 *
 * axEventWatcher emits "axEvent" ({event, pid}) then "treeChanged" (the new
 * SerializedTree). The element the user touched is inferred from the post-event
 * tree's focusedId. The core decision (evaluateInteraction) is pure and unit
 * tested; startVerification() wires it to the live watcher with timers.
 */
import { axEventWatcher } from "../context/axEventWatcher";
import { writeCorrection } from "../ai/planner";
import { safeLog } from "../logger";
import {
  advanceStep,
  correctStep,
  getCurrentGoal,
  getCurrentStep,
} from "./tutorSession";
import type {
  ContractElement,
  ContractStep,
  SerializedTree,
} from "../../shared/partA-contract";

export type InteractionKind = "focus" | "value" | "click" | "window" | "other";

export interface ObservedInteraction {
  /** id of the element the user touched (from the post-event tree's focusedId). */
  elementId: string | null;
  /** human label, for the correction prompt. */
  label?: string;
  kind: InteractionKind;
  tree?: SerializedTree;
}

export type VerifyDecision =
  | { action: "advance" }
  | { action: "correct"; observedLabel: string }
  | { action: "ignore"; reason: string };

/**
 * Pure decision: did this observed interaction satisfy the expected step?
 * No timers, no LLM, no side effects — safe to unit test.
 */
export function evaluateInteraction(
  observed: ObservedInteraction,
  expected: ContractStep | null,
): VerifyDecision {
  if (!expected || expected.goalComplete) {
    return { action: "ignore", reason: "no active targeted step" };
  }
  if (!expected.target) {
    // read/wait steps have no target; advance only on timeout, not here.
    return { action: "ignore", reason: "step has no target element" };
  }
  if (!observed.elementId) {
    return { action: "ignore", reason: "no element interacted" };
  }
  if (observed.elementId === expected.target.elementId) {
    return { action: "advance" };
  }
  // Touched a different known interactive element → treat as a wrong action.
  return {
    action: "correct",
    observedLabel: observed.label ?? observed.elementId,
  };
}

/**
 * Hit-test a physical-pixel click against the tree's element bboxes. Returns the
 * smallest (most specific) element whose bbox contains the point, or null.
 * Click coords and bboxes are both physical screen px (the locked contract), so
 * no scaling is needed here.
 */
export function hitTest(
  tree: SerializedTree | null,
  x: number,
  y: number,
): ContractElement | null {
  if (!tree) return null;
  let best: ContractElement | null = null;
  let bestArea = Infinity;
  for (const el of tree.elements) {
    const [x1, y1, x2, y2] = el.bbox;
    if (x < x1 || x > x2 || y < y1 || y > y2) continue;
    const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (area < bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Apply an observed interaction: evaluate, then advance or correct via the
 * session driver. Returns the decision (handy for tests). Exported so tests can
 * drive it with synthetic observations without the live watcher.
 */
export async function processObserved(
  observed: ObservedInteraction,
): Promise<VerifyDecision> {
  const expected = getCurrentStep();
  const decision = evaluateInteraction(observed, expected);

  if (decision.action === "advance") {
    safeLog("[VERIFY] step satisfied → advancing");
    await advanceStep();
  } else if (decision.action === "correct") {
    safeLog("[VERIFY] wrong target → correcting", {
      observed: decision.observedLabel,
    });
    const message = await writeCorrection(
      getCurrentGoal(),
      { say: expected!.say, label: expected!.target!.label },
      decision.observedLabel,
    );
    correctStep(message);
  }
  return decision;
}

// ── Live wiring (timers + watcher subscription) ────────────────────────────

const TYPING_DEBOUNCE_MS = 2000; // wait for a typing pause before evaluating
const NUDGE_TIMEOUT_MS = 20000; // re-explain the step after silence

let pendingEventType = ""; // last raw AX notification name
let typingTimer: NodeJS.Timeout | null = null;
let nudgeTimer: NodeJS.Timeout | null = null;
let attached = false;

function kindFromEvent(eventName: string): InteractionKind {
  if (/Focused/.test(eventName)) return "focus";
  if (/ValueChanged/.test(eventName)) return "value";
  if (/Window|Title/.test(eventName)) return "window";
  return "other";
}

function observationFromTree(tree: SerializedTree): ObservedInteraction {
  const focused = tree.focusedId
    ? tree.elements.find((e) => e.id === tree.focusedId)
    : undefined;
  return {
    elementId: tree.focusedId,
    label: focused?.label,
    kind: kindFromEvent(pendingEventType),
    tree,
  };
}

function armNudge(): void {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    const step = getCurrentStep();
    if (step && !step.goalComplete) {
      safeLog("[VERIFY] timeout → nudging current step");
      // Re-emit the current step so the overlay re-speaks it (gentle nudge).
      void advanceStepNudge(step);
    }
  }, NUDGE_TIMEOUT_MS);
}

// A nudge re-speaks without advancing: we reuse correctStep with a soft line
// only if there's a target; otherwise leave the step as-is.
async function advanceStepNudge(step: ContractStep): Promise<void> {
  if (!step.target) return;
  correctStep(`Still here whenever you're ready — ${step.say}`);
}

/**
 * Subscribe the verification loop to the live AX watcher. Call once at startup
 * (no-op if already attached). Safe to call before the watcher is running —
 * it just registers listeners.
 *
 * Signals (in order of precision):
 *  - "click" {x,y}: hit-test against the current tree → the touched element.
 *    This is the authoritative signal for click steps.
 *  - "treeChanged" value (typing): debounced; the focused field's value changed.
 *  - "axEvent": only used to tag the pending event kind + arm the nudge timer.
 *
 * The focus-only path is intentionally NOT used to advance/correct: clicks give
 * us the real element, and focus changes alone produced false corrections.
 */
export function startVerification(): void {
  if (attached) return;
  attached = true;

  axEventWatcher.on("axEvent", (evt: { event: string }) => {
    pendingEventType = evt?.event ?? "";
    armNudge();
  });

  // Click: the precise signal — hit-test the point against the live tree.
  axEventWatcher.on("click", (evt: { x: number; y: number }) => {
    armNudge();
    const tree = axEventWatcher.getLatestTree();
    const el = hitTest(tree, evt.x, evt.y);
    void processObserved({
      elementId: el?.id ?? null,
      label: el?.label,
      kind: "click",
      tree: tree ?? undefined,
    });
  });

  // Tree change: only the typing/value case advances (debounced to a pause).
  axEventWatcher.on("treeChanged", (tree: SerializedTree) => {
    armNudge();
    const observed = observationFromTree(tree);
    if (observed.kind !== "value") return;
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(
      () => void processObserved(observed),
      TYPING_DEBOUNCE_MS,
    );
  });

  safeLog("[VERIFY] attached to axEventWatcher (click + typing)");
}

export function stopVerification(): void {
  if (typingTimer) clearTimeout(typingTimer);
  if (nudgeTimer) clearTimeout(nudgeTimer);
  typingTimer = null;
  nudgeTimer = null;
}
