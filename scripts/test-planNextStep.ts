/**
 * Smoke test for the single-step planner (Part A / M1).
 * Run: npx ts-node --transpile-only scripts/test-planNextStep.ts
 * Exercises resolveStep (pure) and planNextStep's fallback path (no API key needed).
 */
import { planNextStep, resolveStep } from "../src/main/ai/planner";
import type {
  SerializedTree,
  PlannerOutput,
} from "../src/shared/partA-contract";

const tree: SerializedTree = {
  app: "Gmail (browser: Chrome)",
  window: "Inbox — user@gmail.com",
  screenScale: 2.0,
  focusedId: "e42",
  elements: [
    { id: "e3", role: "button", label: "Compose", bbox: [88, 120, 160, 150] },
    {
      id: "e17",
      role: "button",
      label: "Attach files",
      bbox: [612, 884, 648, 920],
    },
    {
      id: "e42",
      role: "textfield",
      label: "Search mail",
      value: "",
      bbox: [400, 60, 700, 90],
      focused: true,
    },
  ],
};

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ✓ " + msg);
}

async function main(): Promise<void> {
  console.log("resolveStep — target resolution:");
  const out: PlannerOutput = {
    say: "Click the paperclip to attach a file.",
    element_id: "e17",
    action_type: "click",
    goal_complete: false,
  };
  const step = resolveStep(out, tree, 4);
  assert(step.target?.elementId === "e17", "maps element_id → element");
  assert(step.target?.bbox[0] === 612, "carries physical-px bbox");
  assert(step.target?.screenScale === 2.0, "carries screen scale");
  assert(step.status === "active", "active when not complete");

  console.log("resolveStep — vanished element:");
  const gone = resolveStep({ ...out, element_id: "e999" }, tree, 5);
  assert(gone.target === null, "null target when id missing (caller re-plans)");

  console.log("resolveStep — goal complete:");
  const done = resolveStep(
    {
      say: "All done!",
      element_id: null,
      action_type: "read",
      goal_complete: true,
    },
    tree,
    6,
  );
  assert(
    done.goalComplete === true && done.status === "goal_done",
    "goal_done status",
  );

  console.log("planNextStep — fallback path (no API key):");
  const fb = await planNextStep(
    "send an email with an attachment",
    tree,
    [],
    "",
    1,
  );
  assert(
    typeof fb.say === "string" && fb.say.length > 0,
    "produces a say string",
  );
  assert(fb.stepId === 1, "carries stepId");

  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
