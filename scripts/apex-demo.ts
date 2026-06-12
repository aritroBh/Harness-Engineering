import * as fs from "fs";
import * as path from "path";
import {
  addSource,
  buildApexTransitions,
  compileApexNotesWalkthrough,
  createBundle,
  createSourceNote,
  generateNotesSummary,
  isProhibitedAutonomousAction,
  validateNotesSummary,
} from "../src/main/clinical";
import { WorkflowEngine } from "../src/main/clinical/workflowEngine";
import type { ClinicalContextBundle } from "../src/main/clinical/types";

const FIXTURES_DIR = path.join(__dirname, "..", "test", "fixtures", "clinical");

function header(title: string): void {
  const bar = "=".repeat(72);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

function loadBundle(): ClinicalContextBundle {
  const bundle = createBundle({
    encounterType: "Inpatient admission (UCSF APeX synthetic demo)",
  });
  const specs = [
    {
      f: "hp.txt",
      t: "Inpatient H&P",
      service: "Hospitalist",
      h: "hp",
      screen: "APeX Chart Review > Notes (Encounter Notes filter)",
    },
    {
      f: "ed-provider.txt",
      t: "ED Provider Note",
      service: "Emergency Medicine",
      h: "ed_prov",
      screen: "APeX Chart Review > Notes",
    },
    {
      f: "ed-triage.txt",
      t: "ED Triage / Nursing",
      service: "Nursing",
      h: "ed_triage",
      screen: "APeX Chart Review > Notes",
    },
    {
      f: "gi-consult.txt",
      t: "GI Consult",
      service: "Gastroenterology",
      h: "gi",
      screen: "APeX Chart Review > Notes",
    },
    {
      f: "ed-discharge.txt",
      t: "ED Disposition / Handoff",
      service: "Emergency Medicine",
      h: "ed_disp",
      screen: "APeX Chart Review > Notes",
    },
  ];
  for (const s of specs) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, s.f), "utf-8");
    addSource(
      bundle,
      createSourceNote({
        rawText: raw,
        noteType: s.t,
        service: s.service,
        idHint: s.h,
        sourceScreen: s.screen,
      }),
    );
  }
  bundle.captureMethod = "clipboard";
  return bundle;
}

async function main(): Promise<void> {
  header(
    "APeX CHART REVIEW NOTES SUMMARY — DRY RUN (no real mouse, no real APeX)",
  );
  console.log("All fixtures are SYNTHETIC and contain no real patient data.\n");

  // 1. Bundle from clipboard captures
  header("1) Captured-notes bundle (simulated APeX clipboard captures)");
  const bundle = loadBundle();
  console.log(
    `  ${bundle.sources.length} note(s) in bundle, captureMethod=${bundle.captureMethod}`,
  );
  for (const s of bundle.sources) {
    console.log(
      `   - ${s.id.padEnd(16)} ${(s.noteType ?? "note").padEnd(28)} ${s.rawText.length} chars`,
    );
  }

  // 2. Walkthrough scenario
  header("2) APeX walkthrough (semantic actions, not coordinates)");
  const actions = compileApexNotesWalkthrough();
  console.log(
    `  ${actions.length} steps in scenario "apex_chart_review_notes"`,
  );
  for (const a of actions) {
    const safety = a.safetyLevel.padEnd(20);
    const prohibited = isProhibitedAutonomousAction(a) ? "  ⚠ PROHIBITED" : "";
    console.log(
      `   [${safety}] ${a.id.padEnd(34)} ${a.semanticTarget.label}${prohibited}`,
    );
  }

  // 3. Engine dry-run
  header("3) Engine dry-run (clinician_confirmed pauses are expected)");
  const engine = new WorkflowEngine(actions);
  const run = engine.run({ mode: "dry_run", abortOnBlocked: false });
  for (const t of run.trace) {
    console.log(
      `   [${t.outcome.padEnd(20)}] ${t.id.padEnd(34)} ${t.semanticTarget}`,
    );
  }
  console.log(
    `\n  summary: ${run.trace.length} traced, ${run.paused.length} paused, ${run.blocked.length} blocked`,
  );
  if (run.blocked.length !== 0) {
    console.error("  ✗ APeX walkthrough must never produce blocked actions");
    process.exit(1);
  }
  console.log("  ✓ no prohibited actions in scenario");

  // 4. Transitions
  header("4) APeX state transitions");
  const transitions = buildApexTransitions(actions);
  for (const t of transitions) {
    console.log(
      `   ${(t.from ?? "∅").padEnd(28)} → ${t.to.padEnd(28)} [${t.safetyLevel}] ${t.trigger}`,
    );
  }

  // 5. Summarize
  header("5) Generate read-only summary (panel-only output)");
  const useAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(
    useAnthropic
      ? "  ANTHROPIC_API_KEY set — would call Claude. Using fallback summarizer for offline-safe demo."
      : "  no ANTHROPIC_API_KEY set — using source-grounded fallback summarizer",
  );
  const summary = await generateNotesSummary(bundle, {
    scope: "APeX Chart Review > Notes",
    anthropicClient: null,
  });
  const validation = validateNotesSummary(summary, bundle);
  if (!validation.ok) {
    console.error("  ✗ summary validation FAILED:");
    for (const err of validation.errors) console.error("    - " + err);
    process.exit(1);
  }
  console.log(`  ✓ validation passed`);
  console.log(`  ✓ generator: ${summary.generator}`);
  console.log(`  ✓ per_note: ${summary.per_note.length}`);
  console.log(`  ✓ uncovered: ${summary.uncovered.length}`);

  header("6) Summary content (clinician must verify before any clinical use)");
  console.log("Scope: " + summary.scope);
  console.log("\nOverall:");
  console.log("  " + summary.overall);
  if (summary.bullets.length > 0) {
    console.log("\nHighlights:");
    for (const b of summary.bullets) console.log("  • " + b);
  }
  console.log("\nPer-note:");
  for (const entry of summary.per_note) {
    const meta = [entry.note_type, entry.service].filter(Boolean).join(" · ");
    console.log(
      `  • [${entry.source_id}]${meta ? ` ${meta}` : ""} — ${entry.one_liner}`,
    );
  }
  if (summary.uncovered.length > 0) {
    console.log("\nUncovered:");
    for (const u of summary.uncovered) console.log("  • " + u);
  }
  console.log("\nWarnings:");
  for (const w of summary.warnings) console.log("  ! " + w);

  header(
    "DONE — APeX Chart Review notes summary generated end-to-end. Stays in panel.",
  );
}

main().catch((err) => {
  console.error("[APEX_DEMO] failed:", err);
  process.exit(1);
});
