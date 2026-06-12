import {
  isLikelyHallucinatedTranscript,
  normalizeTranscript,
  shouldAcceptAmbientTranscript,
} from "../src/renderer/overlay/transcriptFilter";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name} — expected ${expected}, got ${actual}`);
  }
}

console.log("normalizeTranscript");
check("strips punctuation", normalizeTranscript("Thank you."), "thank you");
check(
  "strips brackets",
  normalizeTranscript(" [BLANK_AUDIO] "),
  "blank audio",
);
check("collapses spaces", normalizeTranscript("a   b"), "a b");

console.log("isLikelyHallucinatedTranscript");
const hallucinations = [
  "Thank you.",
  "Thanks for watching!",
  "you",
  ".",
  "[Music]",
  "(applause)",
  "Bye.",
  "",
  "   ",
  "♪♪",
];
for (const text of hallucinations) {
  check(`rejects ${JSON.stringify(text)}`, isLikelyHallucinatedTranscript(text), true);
}

const realQuestions = [
  "How do I create an event on Luma?",
  "What does this button do?",
  "Yes",
  "No, the other one",
  "Show me how to add it to my calendar",
  "Can you walk me through creating a project?",
];
for (const text of realQuestions) {
  check(`accepts ${JSON.stringify(text)}`, isLikelyHallucinatedTranscript(text), false);
}

console.log("shouldAcceptAmbientTranscript");
check(
  "rejects real text with too little voiced audio",
  shouldAcceptAmbientTranscript("How do I create an event?", 150),
  false,
);
check(
  "accepts real text with enough voiced audio",
  shouldAcceptAmbientTranscript("How do I create an event?", 900),
  true,
);
check(
  "rejects hallucination even with voiced audio",
  shouldAcceptAmbientTranscript("Thank you.", 900),
  false,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll transcript filter checks passed");
