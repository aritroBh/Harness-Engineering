/**
 * Smoke test for the tutor session driver (Part A / M2).
 * Run: npm run test:tutorSession
 *
 * No Electron, no API key: axEventWatcher has no live tree so the driver uses
 * MOCK_TREE, and planNextStep falls back to a safe step. Verifies the
 * start → thinking → step_advanced loop, step:current caching, and the
 * advance / correct hooks M3 will call.
 */
import {
  startSession,
  getCurrentStep,
  advanceStep,
  correctStep,
  endSession,
  setBrainEventEmitter,
} from "../src/main/session/tutorSession";
import type { BrainEvent } from "../src/shared/partA-contract";

const events: BrainEvent[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ✓ " + msg);
}

const tick = () => new Promise((r) => setTimeout(r, 50));

async function main(): Promise<void> {
  setBrainEventEmitter((e) => events.push(e));

  console.log("startSession:");
  const res = await startSession({
    goal: "send an email with an attachment",
    appHint: "Gmail",
  });
  assert(/^s_/.test(res.sessionId), "returns a session id");
  assert(res.greeting.includes("attachment"), "greeting echoes the goal");
  assert(res.greeting.includes("Gmail"), "greeting echoes the app hint");

  await tick(); // let the fire-and-forget first plan resolve

  console.log("event loop:");
  assert(events[0]?.type === "thinking", "emits thinking first");
  const advanced = events.find((e) => e.type === "step_advanced");
  assert(!!advanced, "emits step_advanced once planned");

  console.log("step:current caching:");
  const cur = getCurrentStep();
  assert(!!cur && typeof cur.say === "string", "current step is cached");
  assert(cur!.stepId === 1, "first step has stepId 1");

  console.log("advanceStep (M3 hook):");
  events.length = 0;
  await advanceStep();
  const next = getCurrentStep();
  assert(next!.stepId === 2, "advances to step 2");
  assert(
    events.some(
      (e) => e.type === "step_advanced" || e.type === "goal_complete",
    ),
    "emits a follow-up event",
  );

  console.log("correctStep (M3 hook):");
  events.length = 0;
  correctStep("Almost — that was Reply. Try the paperclip instead.");
  const corrected = getCurrentStep();
  assert(corrected!.status === "corrected", "status flips to corrected");
  assert(
    corrected!.correction!.includes("paperclip"),
    "correction message is attached",
  );
  assert(events[0]?.type === "step_corrected", "emits step_corrected");

  endSession();
  assert(getCurrentStep() === null, "endSession clears state");

  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
