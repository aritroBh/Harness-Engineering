import {
  buildStepHistory,
  computeStepProgress,
  markCompletedUpTo,
  stepSummary,
  upsertStepInstruction,
} from "../src/renderer/overlay/stepHistory";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}`);
  }
}

const instructions = new Map<number, string>([
  [0, "Open Settings"],
  [1, "Click Privacy"],
  [2, "Enable Screen Recording"],
]);

check(
  "step 2 current marks 0-1 completed",
  buildStepHistory({
    total: 3,
    currentIndex: 2,
    instructions,
  }).map((s) => s.status).join(",") === "completed,completed,current",
);

check(
  "session complete marks all done",
  buildStepHistory({
    total: 3,
    currentIndex: 0,
    instructions,
    sessionComplete: true,
  }).every((s) => s.status === "completed"),
);

check(
  "corrected overrides completed",
  buildStepHistory({
    total: 3,
    currentIndex: 2,
    instructions,
    correctedIndices: new Set([1]),
  }).find((s) => s.index === 1)?.status === "corrected",
);

check(
  "completedIndices persist after currentStep cleared",
  buildStepHistory({
    total: 5,
    currentIndex: 0,
    instructions: new Map([[0, "A"], [1, "B"], [2, "C"], [3, "D"], [4, "E"]]),
    completedIndices: new Set([0, 1, 2, 3, 4]),
    sessionComplete: true,
  }).length === 5,
);

check(
  "markCompletedUpTo adds all prior indices",
  markCompletedUpTo(new Set(), 3).has(0) &&
    markCompletedUpTo(new Set(), 3).has(2) &&
    !markCompletedUpTo(new Set(), 3).has(3),
);

check(
  "progress hits 1 when session complete",
  computeStepProgress(4, 0, new Set(), true) === 1,
);

check(
  "progress partial on current step",
  computeStepProgress(4, 2, new Set([0, 1]), false, false) > 0.5 &&
    computeStepProgress(4, 2, new Set([0, 1]), false, false) < 0.75,
);

check(
  "progress higher when ghost locked on current",
  computeStepProgress(4, 2, new Set([0, 1]), false, true) >
    computeStepProgress(4, 2, new Set([0, 1]), false, false),
);

check(
  "upsertStepInstruction stores trimmed text",
  upsertStepInstruction(new Map(), 1, "  hello ").get(1) === "hello",
);

const summary = stepSummary(
  buildStepHistory({ total: 4, currentIndex: 2, instructions }),
);
check(
  "summary counts statuses",
  summary.completed === 2 &&
    summary.current === 1 &&
    summary.upcoming === 1,
);

console.log("---");
console.log(`${passed}/${passed + failed} step-history checks passed`);
if (failed > 0) process.exit(1);
