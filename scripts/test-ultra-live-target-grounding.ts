/**
 * Integration: ultraConverse must strip hallucinated liveTarget when not in visibleAxLabels.
 * Run: npx ts-node --transpile-only scripts/test-ultra-live-target-grounding.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { ultraConverse } from "../src/main/ai/planner";
import { isLabelResolvableInVisibleSet } from "../src/main/automation/liveTargetResolver";
import { createAnthropicClient } from "../src/main/ai/config";

let failed = 0;

function check(condition: boolean, msg: string): void {
  if (condition) {
    console.log("PASS", msg);
  } else {
    failed++;
    console.error("FAIL", msg);
  }
}

function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/ANTHROPIC_API_KEY[=:]\s*\S+/gi, "ANTHROPIC_API_KEY=[REDACTED]");
}

async function main(): Promise<void> {
  console.log("=== ultraConverse liveTarget grounding integration ===\n");

  const visibleAxLabels = ["Cursor Agents"];
  const saveResolvable = isLabelResolvableInVisibleSet("Save", visibleAxLabels);
  console.log(
    "isLabelResolvableInVisibleSet('Save', ['Cursor Agents']):",
    saveResolvable,
  );
  check(
    saveResolvable === false,
    "isLabelResolvableInVisibleSet('Save', ['Cursor Agents']) is false",
  );

  const hasClient = Boolean(createAnthropicClient());
  console.log(
    "\nAnthropic client available:",
    hasClient,
    "(API key present and valid shape; key not printed)\n",
  );

  const result = await ultraConverse({
    message: "click the save button",
    mode: "ultra",
    visibleAxLabels,
    screenState: { app: "Cursor" },
    sessionHistory: [],
  });

  const report = {
    hasLiveTarget: result.liveTarget !== undefined,
    liveTarget: result.liveTarget ?? null,
    liveTargetUnresolved: result.liveTargetUnresolved ?? null,
    replyPreview: redactSecrets(
      (result.reply || "").slice(0, 200) +
        ((result.reply || "").length > 200 ? "…" : ""),
    ),
    intent: result.intent,
  };

  console.log("ultraConverse result (evidence):");
  console.log(JSON.stringify(report, null, 2));

  if (result.liveTarget) {
    check(
      false,
      `liveTarget must be stripped/absent but got targetLabel=${JSON.stringify(result.liveTarget.targetLabel)}`,
    );
  } else {
    check(
      true,
      "result has no liveTarget (Save hallucination stripped or omitted)",
    );
  }

  if (result.liveTargetUnresolved) {
    check(
      /save/i.test(result.liveTargetUnresolved),
      `liveTargetUnresolved records stripped label (got ${JSON.stringify(result.liveTargetUnresolved)})`,
    );
  }

  console.log("\n--- summary ---");
  if (failed > 0) {
    console.error(`${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("All checks PASSED");
}

main().catch((err) => {
  console.error("Unhandled error:", redactSecrets(String(err?.message || err)));
  process.exit(1);
});
