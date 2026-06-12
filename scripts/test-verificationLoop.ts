/**
 * Smoke test for the verification loop (Part A / M3).
 * Run: npm run test:verificationLoop
 *
 * No Electron, no API key, no live watcher: drives the pure decision function
 * and the processObserved apply-path with synthetic observations, checking it
 * advances on the right element, corrects on the wrong one, and ignores noise.
 */
import {
  evaluateInteraction,
  processObserved,
  hitTest,
  type ObservedInteraction,
} from "../src/main/session/verificationLoop";
import type { SerializedTree } from "../src/shared/partA-contract";
import {
  startSession,
  getCurrentStep,
  setBrainEventEmitter,
  endSession,
} from "../src/main/session/tutorSession";
import type { BrainEvent, ContractStep } from "../src/shared/partA-contract";

const events: BrainEvent[] = [];
const tick = () => new Promise((r) => setTimeout(r, 50));

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ✓ " + msg);
}

const stepTargeting = (id: string): ContractStep => ({
  stepId: 1,
  say: "Click the thing.",
  target: { elementId: id, role: "button", label: "The Thing", bbox: [0, 0, 1, 1], screenScale: 1 },
  actionType: "click",
  status: "active",
  correction: null,
  goalComplete: false,
});

const obs = (elementId: string | null, label?: string): ObservedInteraction => ({
  elementId,
  label,
  kind: "focus",
});

async function main(): Promise<void> {
  console.log("evaluateInteraction (pure):");
  assert(
    evaluateInteraction(obs("e3"), stepTargeting("e3")).action === "advance",
    "right element → advance",
  );
  const wrong = evaluateInteraction(obs("e17", "Attach files"), stepTargeting("e3"));
  assert(wrong.action === "correct", "wrong element → correct");
  assert(
    wrong.action === "correct" && wrong.observedLabel === "Attach files",
    "correction carries the observed label",
  );
  assert(
    evaluateInteraction(obs(null), stepTargeting("e3")).action === "ignore",
    "no element → ignore",
  );
  assert(
    evaluateInteraction(obs("e3"), null).action === "ignore",
    "no active step → ignore",
  );

  console.log("hitTest (click → element):");
  const tree: SerializedTree = {
    app: "Gmail",
    window: "Inbox",
    screenScale: 2,
    focusedId: null,
    elements: [
      { id: "e3", role: "button", label: "Compose", bbox: [88, 120, 160, 150] },
      { id: "e17", role: "button", label: "Attach files", bbox: [612, 884, 648, 920] },
      // a big container overlapping e17, to prove we pick the smallest hit
      { id: "e0", role: "group", label: "Toolbar", bbox: [600, 880, 900, 940] },
    ],
  };
  assert(hitTest(tree, 630, 900)?.id === "e17", "click inside a button hits it");
  assert(hitTest(tree, 120, 135)?.id === "e3", "click hits the right button");
  assert(hitTest(tree, 5, 5) === null, "click in empty space hits nothing");
  assert(hitTest(null, 10, 10) === null, "null tree is safe");

  console.log("processObserved (apply-path, live session):");
  setBrainEventEmitter((e) => events.push(e));
  await startSession({ goal: "send an email with an attachment", appHint: "Gmail" });
  await tick();
  const current = getCurrentStep();
  const targetId = current!.target!.elementId; // fallback planner picked the first element
  assert(!!targetId, "session produced a targeted first step");

  events.length = 0;
  const d1 = await processObserved(obs(targetId));
  assert(d1.action === "advance", "interacting with the target advances");
  assert(getCurrentStep()!.stepId === 2, "now on step 2");

  events.length = 0;
  const d2 = await processObserved(obs("e_nonexistent", "Some Other Button"));
  assert(d2.action === "correct", "interacting with a different element corrects");
  assert(getCurrentStep()!.status === "corrected", "current step marked corrected");
  assert(typeof getCurrentStep()!.correction === "string", "correction message set");
  assert(events.some((e) => e.type === "step_corrected"), "emits step_corrected");

  endSession();
  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
