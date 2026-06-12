import * as fs from "fs";
import * as path from "path";
import {
  addSource,
  assertNotProhibited,
  buildTransitions,
  ClinicalSafetyError,
  compileEhrWorkflow,
  createBundle,
  createSourceNote,
  generateDraftNote,
  isProhibitedAutonomousAction,
  PROHIBITED_AUTONOMOUS_ACTIONS,
  summarizeBundle,
  validateDraft,
} from "../src/main/clinical";
import type {
  ActionTrace,
  ClinicalContextBundle,
  EhrAction,
} from "../src/main/clinical/types";

const FIXTURES_DIR = path.join(__dirname, "..", "test", "fixtures", "clinical");

interface FixtureSpec {
  file: string;
  noteType: string;
  service: string;
  idHint: string;
  sourceScreen: string;
}

const FIXTURES: FixtureSpec[] = [
  {
    file: "hp.txt",
    noteType: "Inpatient H&P",
    service: "Hospitalist",
    idHint: "hp",
    sourceScreen: "Chart Review > Notes (Inpatient filter)",
  },
  {
    file: "ed-provider.txt",
    noteType: "ED Provider Note",
    service: "Emergency Medicine",
    idHint: "ed_prov",
    sourceScreen: "Notes activity",
  },
  {
    file: "ed-triage.txt",
    noteType: "ED Triage / Nursing",
    service: "Nursing",
    idHint: "ed_triage",
    sourceScreen: "Notes activity",
  },
  {
    file: "gi-consult.txt",
    noteType: "GI Consult",
    service: "Gastroenterology",
    idHint: "gi",
    sourceScreen: "Notes activity",
  },
  {
    file: "ed-discharge.txt",
    noteType: "ED Disposition / Handoff",
    service: "Emergency Medicine",
    idHint: "ed_disp",
    sourceScreen: "Notes activity",
  },
];

function header(title: string): void {
  const bar = "=".repeat(72);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

function loadBundle(): ClinicalContextBundle {
  const bundle = createBundle({
    encounterType: "Inpatient admission",
  });
  for (const spec of FIXTURES) {
    const fullPath = path.join(FIXTURES_DIR, spec.file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    const source = createSourceNote({
      rawText: raw,
      noteType: spec.noteType,
      service: spec.service,
      idHint: spec.idHint,
      sourceScreen: spec.sourceScreen,
    });
    addSource(bundle, source);
  }
  // Test dedup: re-add the H&P. Should be a no-op.
  const dupRaw = fs.readFileSync(path.join(FIXTURES_DIR, "hp.txt"), "utf-8");
  const dup = createSourceNote({ rawText: dupRaw, idHint: "hp" });
  const { deduped } = addSource(bundle, dup);
  if (!deduped) {
    throw new Error("dedup failed: H&P added twice");
  }
  return bundle;
}

function runWorkflow(actions: EhrAction[]): {
  trace: ActionTrace[];
  paused: EhrAction[];
  blocked: EhrAction[];
} {
  const trace: ActionTrace[] = [];
  const paused: EhrAction[] = [];
  const blocked: EhrAction[] = [];
  const start = Date.now();

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const ts = Date.now() - start + i;

    if (isProhibitedAutonomousAction(a)) {
      blocked.push(a);
      trace.push({
        id: a.id,
        timestampMs: ts,
        action: a.action,
        semanticTarget: a.semanticTarget.label,
        screenRegion: a.semanticTarget.expectedRegion,
        preconditions: a.preconditions ?? [],
        postconditions: a.postconditions ?? [],
        safetyLevel: a.safetyLevel,
        replayAllowed: a.replayAllowed,
        outcome: "blocked",
        notes: "Prohibited autonomous action — clinician signs manually.",
      });
      continue;
    }

    if (a.safetyLevel === "clinician_confirmed") {
      paused.push(a);
      trace.push({
        id: a.id,
        timestampMs: ts,
        action: a.action,
        semanticTarget: a.semanticTarget.label,
        screenRegion: a.semanticTarget.expectedRegion,
        preconditions: a.preconditions ?? [],
        postconditions: a.postconditions ?? [],
        safetyLevel: a.safetyLevel,
        replayAllowed: a.replayAllowed,
        outcome: "paused_for_clinician",
        notes: "Awaiting explicit clinician confirmation.",
      });
      continue;
    }

    const outcome: ActionTrace["outcome"] =
      a.action === "observe" ? "observed" : "executed";
    trace.push({
      id: a.id,
      timestampMs: ts,
      action: a.action,
      semanticTarget: a.semanticTarget.label,
      screenRegion: a.semanticTarget.expectedRegion,
      preconditions: a.preconditions ?? [],
      postconditions: a.postconditions ?? [],
      safetyLevel: a.safetyLevel,
      replayAllowed: a.replayAllowed,
      outcome,
    });
  }

  return { trace, paused, blocked };
}

function assertSafety(actions: EhrAction[]): void {
  // Every prohibited action must throw if anyone tries to execute it autonomously.
  let throws = 0;
  for (const a of actions.filter(isProhibitedAutonomousAction)) {
    try {
      assertNotProhibited(a, "autonomous");
      throw new Error(
        `BUG: assertNotProhibited did not throw for ${a.id} in autonomous mode`,
      );
    } catch (e) {
      if (e instanceof ClinicalSafetyError) {
        throws++;
        continue;
      }
      throw e;
    }
  }
  if (throws === 0) {
    throw new Error("safety gate test failed: no prohibited actions tripped");
  }
  console.log(
    `  ✓ ${throws} prohibited action(s) correctly refused autonomous execution`,
  );

  // The same actions in clinician_confirmed mode must NOT throw.
  for (const a of actions.filter(isProhibitedAutonomousAction)) {
    assertNotProhibited(a, "clinician_confirmed");
  }
  console.log(
    "  ✓ same actions accepted in clinician_confirmed mode (manual sign path open)",
  );

  console.log(
    `  ✓ prohibited list: ${PROHIBITED_AUTONOMOUS_ACTIONS.join(", ")}`,
  );
}

async function main(): Promise<void> {
  header("CLINICAL DEMO — DRY RUN (no real mouse, no real EHR)");
  console.log("All fixtures are SYNTHETIC and contain no real patient data.\n");

  // 1. Build context bundle from fixtures
  header("1) Build clinical context bundle");
  const bundle = loadBundle();
  console.log(summarizeBundle(bundle));

  // 2. Compile workflow + transitions
  header("2) Compile EHR workflow (semantic actions, not coordinates)");
  const actions = compileEhrWorkflow();
  const transitions = buildTransitions(actions);
  console.log(`  ${actions.length} semantic actions across 6 phases`);
  console.log(`  ${transitions.length} state transitions`);
  for (const t of transitions) {
    console.log(
      `   ${(t.from ?? "∅").padEnd(28)} → ${t.to.padEnd(28)} [${t.safetyLevel}] ${t.trigger}`,
    );
  }

  // 3. Run workflow in dry-run mode (no real automation)
  header("3) Dry-run workflow execution");
  const { trace, paused, blocked } = runWorkflow(actions);
  for (const t of trace) {
    console.log(
      `   [${t.outcome.padEnd(20)}] ${t.id.padEnd(34)} ${t.semanticTarget}`,
    );
  }
  console.log(
    `\n  summary: ${trace.length} traced, ${paused.length} paused for clinician, ${blocked.length} blocked as prohibited`,
  );

  // 4. Safety gate assertions
  header("4) Safety gate assertions");
  assertSafety(actions);

  // 5. Generate draft note (anthropic if key present, else fallback)
  header("5) Generate source-grounded draft note");
  const useAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(
    useAnthropic
      ? "  ANTHROPIC_API_KEY set — would call Claude. Using fallback drafter for offline-safe demo."
      : "  no ANTHROPIC_API_KEY set — using source-grounded fallback drafter",
  );
  const draft = await generateDraftNote(bundle, {
    draftNoteType: "Inpatient Progress Note",
    anthropicClient: null,
  });
  const validation = validateDraft(draft, bundle);
  if (!validation.ok) {
    console.error("  ✗ draft validation FAILED:");
    for (const err of validation.errors) console.error("    - " + err);
    process.exit(1);
  }
  console.log("  ✓ draft validation passed");
  console.log("  ✓ generator: " + draft.generator);
  console.log(`  ✓ source_map entries: ${draft.source_map.length}`);
  console.log(
    `  ✓ uncertain_or_missing_info: ${draft.uncertain_or_missing_info.length} item(s)`,
  );

  // 6. Print the draft
  header("6) Draft note (clinician must verify before signing)");
  console.log("Type: " + draft.draft_note_type);
  console.log("Summary: " + draft.summary + "\n");
  for (const [k, v] of Object.entries(draft.draft_note)) {
    console.log(`-- ${k} --`);
    console.log(v);
    console.log();
  }
  console.log("source_map:");
  for (const e of draft.source_map) {
    console.log(`  • [${e.source_ids.join(", ")}] ${e.claim}`);
  }
  if (draft.uncertain_or_missing_info.length > 0) {
    console.log("\nuncertain_or_missing_info:");
    for (const m of draft.uncertain_or_missing_info) console.log("  • " + m);
  }
  console.log("\nwarnings:");
  for (const w of draft.warnings) console.log("  ! " + w);

  header("DONE — pipeline ran end-to-end with all safety gates intact.");
}

main().catch((err) => {
  console.error("[CLINICAL_DEMO] failed:", err);
  process.exit(1);
});
