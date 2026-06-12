/**
 * Unit tests for live ghost parsing + AX label matching.
 * Run: npx ts-node --transpile-only scripts/test-live-ghost-unit.ts
 */
import { parseUltraLiveTarget } from "../src/main/ai/planner";
import { isLabelResolvableInVisibleSet } from "../src/main/automation/liveTargetResolver";

let failed = 0;

function check(condition: boolean, msg: string) {
  if (condition) {
    console.log("PASS", msg);
  } else {
    failed++;
    console.error("FAIL", msg);
  }
}

const parsed = parseUltraLiveTarget({
  targetLabel: "Create Event",
  action: "click",
  instruction: "Click here",
});
check(
  parsed?.targetLabel === "Create Event" && parsed?.action === "click",
  "parseUltraLiveTarget accepts valid liveTarget JSON",
);
check(
  parseUltraLiveTarget({ targetLabel: "", action: "click" }) === undefined,
  "parseUltraLiveTarget rejects empty targetLabel",
);
check(
  parseUltraLiveTarget({ targetLabel: "Save", action: "fly" }) === undefined,
  "parseUltraLiveTarget rejects invalid action",
);
check(
  isLabelResolvableInVisibleSet("Create Event", [
    "Create Event",
    "Add to Calendar",
  ]),
  "isLabelResolvableInVisibleSet matches exact visible label",
);
check(
  !isLabelResolvableInVisibleSet("Save", ["Cursor Agents", "Close"]),
  "isLabelResolvableInVisibleSet rejects generic label absent from AX list",
);
check(
  isLabelResolvableInVisibleSet("Agents", ["Cursor Agents"]),
  "isLabelResolvableInVisibleSet accepts fuzzy substring overlap",
);
check(
  !isLabelResolvableInVisibleSet("Save", ["replaySavedWorkflow"]),
  "short label buried in long code identifier does not match",
);
check(
  isLabelResolvableInVisibleSet("New Agent", ["New Agent ⌘N"]),
  "label with trailing shortcut hint still matches",
);

{
  const visibleAxLabels = ["Cursor Agents"];
  let liveTarget = parseUltraLiveTarget({
    targetLabel: "Save",
    action: "click",
  });
  let liveTargetUnresolved: string | undefined;
  if (
    liveTarget &&
    !isLabelResolvableInVisibleSet(liveTarget.targetLabel, visibleAxLabels)
  ) {
    liveTargetUnresolved = liveTarget.targetLabel;
    liveTarget = undefined;
  }
  check(
    liveTarget === undefined && liveTargetUnresolved === "Save",
    "forced Save liveTarget is stripped with liveTargetUnresolved set",
  );
}

if (failed > 0) {
  console.error(`\n${failed} live-ghost unit test(s) failed`);
  process.exit(1);
}
console.log("\nAll live-ghost unit tests passed");
