/**
 * Smoke test for the memory layer (Part A / M4).
 * Run: npm run test:skillProfile
 *
 * Uses a temp SPECTER_PROFILE_PATH so it never touches real user data. Covers
 * the store round-trip, profileSummary text, summarizeSession's heuristic
 * fallback, and the "Welcome back!" greeting path through the session driver.
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Must set the override BEFORE importing modules that read it.
process.env.SPECTER_PROFILE_PATH = join(
  mkdtempSync(join(tmpdir(), "specter-profile-")),
  "profiles.json",
);

import {
  getProfile,
  setProfile,
  profileSummary,
  seedDemoProfile,
} from "../src/main/session/skillProfileStore";
import { summarizeSession } from "../src/main/ai/planner";
import {
  startSession,
  endSession,
  setBrainEventEmitter,
} from "../src/main/session/tutorSession";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ✓ " + msg);
}

async function main(): Promise<void> {
  console.log("store round-trip:");
  assert(getProfile("Gmail") === null, "unknown app → null");
  setProfile("Gmail", {
    proficiency: "beginner+",
    knows: ["composing"],
    struggledWith: ["attachments"],
  });
  const loaded = getProfile("Gmail");
  assert(loaded?.knows.includes("composing") === true, "persists knows");
  assert(loaded?.proficiency === "beginner+", "persists proficiency");

  console.log("profileSummary:");
  const summary = profileSummary("Gmail");
  assert(summary.includes("composing"), "summary mentions known skills");
  assert(summary.includes("attachments"), "summary mentions struggles");
  assert(profileSummary("Figma") === "", "empty for unknown app");

  console.log("summarizeSession (heuristic fallback, no API key):");
  const updated = await summarizeSession(
    "schedule a send",
    ["Click Compose", "Click the dropdown", "Pick a time"],
    0,
    getProfile("Gmail"),
  );
  assert(updated.knows.includes("schedule a send"), "adds completed goal to knows");
  assert(
    updated.proficiency === "intermediate",
    "clean run bumps proficiency one rung (beginner+ → intermediate)",
  );

  const struggled = await summarizeSession("filters", ["a", "b"], 2, null);
  assert(
    struggled.struggledWith.includes("filters"),
    "corrections land the topic in struggledWith",
  );

  console.log('"Welcome back!" greeting:');
  setBrainEventEmitter(() => {});
  seedDemoProfile("Gmail"); // no-op since Gmail already has a profile
  const res = await startSession({
    goal: "send an email with an attachment",
    appHint: "Gmail",
  });
  assert(res.greeting.startsWith("Welcome back!"), "greets returning users");
  assert(res.greeting.includes("composing"), "greeting references prior knowledge");
  endSession();

  const fresh = await startSession({ goal: "do a thing", appHint: "Figma" });
  assert(!fresh.greeting.startsWith("Welcome back!"), "first-timer gets generic greeting");
  endSession();

  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
