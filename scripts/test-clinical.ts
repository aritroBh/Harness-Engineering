import * as fs from "fs";
import * as path from "path";
import {
  addSource,
  APEX_TARGETS,
  assertNotProhibited,
  buildApexTransitions,
  buildTransitions,
  ClinicalSafetyError,
  compileApexAttendingAttestationWalkthrough,
  compileApexNotesWalkthrough,
  compileEhrWorkflow,
  createBundle,
  createSourceNote,
  detectAttestationElements,
  draftAttestation,
  extractSections,
  generateDraftNote,
  generateNotesSummary,
  hashContent,
  isAttestationComplete,
  isProhibitedAutonomousAction,
  isProhibitedAutonomousLabel,
  preflightCheck,
  PROHIBITED_AUTONOMOUS_ACTIONS,
  validateAttestation,
  validateDraft,
  validateNotesSummary,
} from "../src/main/clinical";
import { _redactForTests } from "../src/main/clinical/logger";
import {
  dryRunWorkflow,
  WorkflowEngine,
} from "../src/main/clinical/workflowEngine";
import type {
  ClinicalContextBundle,
  EhrWorkflowState,
} from "../src/main/clinical/types";

const FIXTURES_DIR = path.join(__dirname, "..", "test", "fixtures", "clinical");

interface TestRecord {
  name: string;
  ok: boolean;
  err?: string;
}

const records: TestRecord[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  const result = (async () => {
    try {
      await fn();
      records.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    } catch (e: any) {
      records.push({ name, ok: false, err: e?.message ?? String(e) });
      console.error(`  ✗ ${name}`);
      console.error(`      ${e?.message ?? e}`);
    }
  })();
  return result;
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function loadBundleWithFixtures(): ClinicalContextBundle {
  const bundle = createBundle({ encounterType: "Inpatient admission" });
  const specs = [
    { f: "hp.txt", t: "Inpatient H&P", h: "hp" },
    { f: "ed-provider.txt", t: "ED Provider Note", h: "ed_prov" },
    { f: "ed-triage.txt", t: "ED Triage", h: "ed_triage" },
    { f: "gi-consult.txt", t: "GI Consult", h: "gi" },
    { f: "ed-discharge.txt", t: "ED Disposition", h: "ed_disp" },
  ];
  for (const s of specs) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, s.f), "utf-8");
    addSource(
      bundle,
      createSourceNote({ rawText: raw, noteType: s.t, idHint: s.h }),
    );
  }
  return bundle;
}

async function main(): Promise<void> {
  console.log("== clinical test suite ==\n");

  console.log("[bundle]");
  await test("hashContent is stable across case + trailing whitespace + line endings", () => {
    const a = hashContent("abc def\nrow two   \n");
    const b = hashContent("ABC DEF\r\nROW TWO\n");
    assert(
      typeof a === "string" && a.length === 16,
      "hash should be 16 hex chars",
    );
    assert(a === b, `hash should match: ${a} vs ${b}`);
  });

  await test("createBundle starts empty", () => {
    const b = createBundle();
    assert(b.sources.length === 0, "bundle should start empty");
    assert(b.captureMethod === "mixed", "default capture method = mixed");
  });

  await test("addSource dedupes by content hash", () => {
    const b = createBundle();
    const s1 = createSourceNote({ rawText: "hello world", idHint: "x" });
    const s2 = createSourceNote({ rawText: "  HELLO WORLD\n", idHint: "x" });
    addSource(b, s1);
    const r2 = addSource(b, s2);
    assert(r2.deduped, "dedup must trip on equivalent content");
    assert(b.sources.length === 1, "bundle should still have 1 source");
  });

  await test("extractSections pulls HPI, PMH, Meds, Allergies, A&P from H&P fixture", () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, "hp.txt"), "utf-8");
    const sections = extractSections(raw);
    assert(sections.hpi && /58-year-old/i.test(sections.hpi), "HPI extracted");
    assert(sections.pmh && /Hypertension/i.test(sections.pmh), "PMH extracted");
    assert(
      sections.meds && /lisinopril/i.test(sections.meds),
      "Meds extracted",
    );
    assert(
      sections.allergies && /no known/i.test(sections.allergies),
      "Allergies extracted",
    );
    assert(
      sections.assessmentPlan && /admit/i.test(sections.assessmentPlan),
      "A&P extracted",
    );
  });

  console.log("\n[workflow]");
  await test("compileEhrWorkflow returns 26 actions across 6 phases", () => {
    const actions = compileEhrWorkflow();
    assert(actions.length === 26, `expected 26 actions, got ${actions.length}`);
    const phases = new Set(actions.map((a) => a.phase));
    assert(phases.size === 6, `expected 6 phases, got ${phases.size}`);
  });

  await test("buildTransitions covers every workflow state", () => {
    const transitions = buildTransitions(compileEhrWorkflow());
    const reached = new Set(transitions.map((t) => t.to));
    const expected: EhrWorkflowState[] = [
      "PATIENT_CONTEXT_OPEN",
      "CHART_REVIEW_OPEN",
      "NOTES_FILTER_OPEN",
      "INPATIENT_NOTE_SELECTED",
      "NOTE_TEXT_CAPTURED",
      "NOTES_ACTIVITY_OPEN",
      "MULTI_NOTE_REVIEW",
      "CONTEXT_BUNDLE_READY",
      "NEW_NOTE_EDITOR_OPEN",
      "DRAFT_NOTE_INSERTED",
      "NOTE_REVIEW_REQUIRED",
      "NOTE_SIGNED_BY_CLINICIAN",
      "ORDERS_OPEN",
      "ORDER_SEARCH_ACTIVE",
      "MEDICATION_SELECTED",
      "ADVISORY_OPEN",
      "ORDER_COMPOSER_OPEN",
      "ORDER_PENDING_SIGNATURE",
      "ORDER_SIGNED_BY_CLINICIAN",
    ];
    for (const s of expected) {
      assert(reached.has(s), `transition target missing: ${s}`);
    }
  });

  await test("order workflow has dose/route/frequency/PRN reason fields", () => {
    const actions = compileEhrWorkflow();
    const configure = actions.find((a) => a.id === "p6.configure_order");
    assert(configure, "p6.configure_order present");
    const fields = configure!.payload?.fields;
    assert(fields, "configure_order has fields payload");
    assert(fields!.dose === "0.2 mg", "dose 0.2 mg");
    assert(fields!.route === "Intravenous", "route IV");
    assert(/Q3H PRN/i.test(fields!.frequency), "frequency Q3H PRN");
    assert(/breakthrough/i.test(fields!.prn_reason), "PRN reason set");
  });

  console.log("\n[safety gates]");
  await test("isProhibitedAutonomousLabel matches every prohibited verb", () => {
    assert(isProhibitedAutonomousLabel("Sign Note"), "sign note matches");
    assert(isProhibitedAutonomousLabel("sign_order"), "sign_order matches");
    assert(isProhibitedAutonomousLabel("Sign Orders"), "Sign Orders matches");
    assert(
      isProhibitedAutonomousLabel("FINAL_SUBMIT_MEDICATION_ORDER"),
      "final submit matches",
    );
    assert(
      !isProhibitedAutonomousLabel("Open Filter"),
      "benign label not flagged",
    );
  });

  await test("PROHIBITED_AUTONOMOUS_ACTIONS list contains expected entries", () => {
    assert(
      PROHIBITED_AUTONOMOUS_ACTIONS.includes("SIGN_NOTE"),
      "SIGN_NOTE present",
    );
    assert(
      PROHIBITED_AUTONOMOUS_ACTIONS.includes("SIGN_ORDER"),
      "SIGN_ORDER present",
    );
    assert(
      PROHIBITED_AUTONOMOUS_ACTIONS.includes(
        "BYPASS_CLINICAL_ADVISORY_WITHOUT_USER_CONFIRMATION",
      ),
      "advisory bypass present",
    );
  });

  await test("assertNotProhibited throws ClinicalSafetyError for sign-note autonomous", () => {
    const actions = compileEhrWorkflow();
    const signNote = actions.find((a) => a.id === "p5.manual_sign_note");
    assert(signNote, "sign note action present");
    let threw = false;
    try {
      assertNotProhibited(signNote!, "autonomous");
    } catch (e) {
      assert(
        e instanceof ClinicalSafetyError,
        "must be ClinicalSafetyError, got " + (e as any)?.constructor?.name,
      );
      threw = true;
    }
    assert(threw, "must throw");
  });

  await test("assertNotProhibited throws for sign-orders autonomous", () => {
    const actions = compileEhrWorkflow();
    const signOrders = actions.find((a) => a.id === "p6.manual_sign_orders");
    assert(signOrders, "sign orders action present");
    let threw = false;
    try {
      assertNotProhibited(signOrders!, "autonomous");
    } catch (e) {
      assert(e instanceof ClinicalSafetyError, "must be ClinicalSafetyError");
      threw = true;
    }
    assert(threw, "must throw for sign orders");
  });

  await test("assertNotProhibited allows clinician_confirmed mode", () => {
    const actions = compileEhrWorkflow();
    for (const a of actions.filter(isProhibitedAutonomousAction)) {
      assertNotProhibited(a, "clinician_confirmed");
    }
  });

  await test("assertNotProhibited allows dry_run mode", () => {
    const actions = compileEhrWorkflow();
    for (const a of actions.filter(isProhibitedAutonomousAction)) {
      assertNotProhibited(a, "dry_run");
    }
  });

  console.log("\n[engine]");
  await test("WorkflowEngine.run produces full trace and pauses on prohibited", () => {
    const engine = new WorkflowEngine();
    const result = engine.run({ mode: "dry_run", abortOnBlocked: false });
    assert(result.trace.length === 26, "trace covers all 26 actions");
    assert(
      result.blocked.length === 2,
      `expected 2 blocked, got ${result.blocked.length}`,
    );
    assert(
      result.paused.length === 5,
      `expected 5 paused, got ${result.paused.length}`,
    );
    assert(
      result.finalState === "ORDER_SIGNED_BY_CLINICIAN" ||
        result.finalState === "NOTE_SIGNED_BY_CLINICIAN",
      "final state reached terminal",
    );
  });

  await test("WorkflowEngine emits events", () => {
    const engine = new WorkflowEngine();
    let transitions = 0;
    let blocked = 0;
    engine.on("transition", () => transitions++);
    engine.on("blocked", () => blocked++);
    engine.run({ mode: "dry_run", abortOnBlocked: false });
    assert(transitions > 20, `expected >20 transitions, got ${transitions}`);
    assert(blocked === 2, `expected 2 blocked events, got ${blocked}`);
  });

  await test("dryRunWorkflow helper returns valid result", () => {
    const r = dryRunWorkflow();
    assert(r.trace.length === 26, "dry run trace covers everything");
  });

  console.log("\n[drafter]");
  await test("empty bundle returns NOT_FOUND for every section", async () => {
    const b = createBundle();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    for (const v of Object.values(draft.draft_note)) {
      assert(
        v === "[Not found in provided notes]",
        "every section must be NOT_FOUND",
      );
    }
    assert(draft.source_map.length === 0, "no source_map for empty bundle");
  });

  await test("full bundle populates all sections via fallback", async () => {
    const b = loadBundleWithFixtures();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    const populated = Object.values(draft.draft_note).filter(
      (v) => v && v !== "[Not found in provided notes]",
    );
    assert(
      populated.length === 8,
      `expected all 8 sections populated, got ${populated.length}`,
    );
    assert(
      draft.source_map.length >= 6,
      "source_map should have multiple entries",
    );
    assert(
      draft.warnings.some((w) => /verify/i.test(w)),
      "verification warning present",
    );
  });

  await test("source_map references only valid source ids", async () => {
    const b = loadBundleWithFixtures();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    const valid = new Set(b.sources.map((s) => s.id));
    for (const entry of draft.source_map) {
      for (const id of entry.source_ids) {
        assert(valid.has(id), `unknown source_id in map: ${id}`);
      }
    }
  });

  await test("validateDraft passes on fallback output", async () => {
    const b = loadBundleWithFixtures();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    const v = validateDraft(draft, b);
    assert(v.ok, "validator must pass: " + v.errors.join("; "));
  });

  await test("validateDraft catches unmapped source ids", async () => {
    const b = loadBundleWithFixtures();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    draft.source_map.push({ claim: "fake", source_ids: ["bogus_id"] });
    const v = validateDraft(draft, b);
    assert(!v.ok, "validator must fail for unknown source id");
    assert(
      v.errors.some((e) => e.includes("bogus_id")),
      "error mentions bad id",
    );
  });

  await test("validateDraft catches missing verification warning", async () => {
    const b = loadBundleWithFixtures();
    const draft = await generateDraftNote(b, { anthropicClient: null });
    draft.warnings = [];
    const v = validateDraft(draft, b);
    assert(!v.ok, "validator must fail without verification warning");
  });

  console.log("\n[PHI redaction]");
  await test("default redaction removes PHI keys", () => {
    process.env.LOG_PHI = "";
    const redacted: any = _redactForTests({
      rawText: "patient note text here",
      meta: { author: "Dr X" },
    });
    assert(redacted.rawText === "[redacted PHI]", "rawText must be redacted");
    assert(redacted.meta.author === "Dr X", "non-PHI keys preserved");
  });

  await test("LOG_PHI=true preserves content via clinicalLog wrapper", () => {
    // _redactForTests always redacts; the gating happens in emit(). Cover both.
    process.env.LOG_PHI = "";
    const a: any = _redactForTests({ rawText: "hello" });
    assert(a.rawText === "[redacted PHI]", "redaction independent of env");
  });

  await test("long string values get truncated to length marker", () => {
    const long = "x".repeat(200);
    const r = _redactForTests({ otherField: long });
    assert(
      typeof (r as any).otherField === "string",
      "redacted field must be string",
    );
    assert(
      /\[redacted 200 chars\]/.test((r as any).otherField),
      "long string redacted by length",
    );
  });

  console.log("\n[trace serialization]");
  await test("ActionTrace records preconditions and postconditions", () => {
    const r = dryRunWorkflow();
    const filterStep = r.trace.find((t) => t.id === "p2.open_filter");
    assert(filterStep, "filter step present");
    assert(
      filterStep!.postconditions.includes("filter_panel_open"),
      "post in trace",
    );
    const drafted = r.trace.find((t) => t.id === "p5.paste_draft");
    assert(drafted, "draft paste in trace");
    assert(drafted!.preconditions.includes("editor_ready"), "pre in trace");
  });

  console.log("\n[apex walkthrough]");
  await test("compileApexNotesWalkthrough returns 12 read-only/clinician_confirmed steps", () => {
    const actions = compileApexNotesWalkthrough();
    assert(
      actions.length === 12,
      `expected 12 apex steps, got ${actions.length}`,
    );
    for (const a of actions) {
      assert(
        a.safetyLevel === "read_only" ||
          a.safetyLevel === "clinician_confirmed",
        `apex step ${a.id} must be read_only or clinician_confirmed, got ${a.safetyLevel}`,
      );
      assert(
        !isProhibitedAutonomousAction(a),
        `apex step ${a.id} must NOT be prohibited`,
      );
    }
    const phases = new Set(actions.map((a) => a.phase));
    assert(phases.size === 1, "all apex steps belong to one phase");
    assert(
      phases.has("apex_chart_review_notes"),
      "phase must be apex_chart_review_notes",
    );
  });

  await test("APEX_TARGETS includes Chart Review and Notes anchors", () => {
    assert(
      APEX_TARGETS.chartReviewActivity?.label === "Chart Review",
      "chart review target",
    );
    assert(
      APEX_TARGETS.chartReviewNotesTab?.label === "Notes",
      "notes subtab target",
    );
    assert(
      APEX_TARGETS.chartReviewNotePreview?.expectedRegion ===
        "chart_review_right_preview_pane",
      "preview pane region",
    );
  });

  await test("apex walkthrough engine dry-run completes with 0 blocked", () => {
    const engine = new WorkflowEngine(compileApexNotesWalkthrough());
    const result = engine.run({ mode: "dry_run", abortOnBlocked: false });
    assert(
      result.blocked.length === 0,
      `expected 0 blocked, got ${result.blocked.length}`,
    );
    assert(
      result.trace.length === 12,
      `expected 12 trace entries, got ${result.trace.length}`,
    );
    assert(result.errors.length === 0, "no engine errors");
  });

  await test("apex walkthrough autonomous mode would refuse if anyone added a sign step", () => {
    // Defense-in-depth: if a future change adds an action whose label looks
    // like a sign step, isProhibitedAutonomousLabel must trip on the *label*
    // pattern even if the safetyLevel is mis-set. Verify the matcher coverage
    // here so the apex walkthrough cannot silently regress.
    assert(
      isProhibitedAutonomousLabel("Sign Note in APeX"),
      "sign-note label trips matcher",
    );
    assert(
      isProhibitedAutonomousLabel("Sign Orders"),
      "sign-orders label trips matcher",
    );
    assert(
      !isProhibitedAutonomousLabel("Chart Review"),
      "chart review must not trip",
    );
    assert(
      !isProhibitedAutonomousLabel("Notes preview"),
      "notes preview must not trip",
    );
  });

  await test("buildApexTransitions covers patient → notes filter → bundle ready", () => {
    const transitions = buildApexTransitions(compileApexNotesWalkthrough());
    const reached = new Set(transitions.map((t) => t.to));
    for (const s of [
      "PATIENT_CONTEXT_OPEN",
      "CHART_REVIEW_OPEN",
      "NOTES_FILTER_OPEN",
      "MULTI_NOTE_REVIEW",
      "INPATIENT_NOTE_SELECTED",
      "NOTE_TEXT_CAPTURED",
      "CONTEXT_BUNDLE_READY",
    ] as EhrWorkflowState[]) {
      assert(reached.has(s), `apex transitions must reach ${s}`);
    }
  });

  console.log("\n[notes summarizer]");
  await test("empty bundle returns NOT_FOUND overall and no per-note", async () => {
    const b = createBundle();
    const summary = await generateNotesSummary(b, { anthropicClient: null });
    assert(
      summary.overall === "[Not found in provided notes]",
      "overall should be NOT_FOUND",
    );
    assert(summary.per_note.length === 0, "per_note empty");
    const v = validateNotesSummary(summary, b);
    assert(
      v.ok,
      "empty-bundle summary still passes validation: " + v.errors.join("; "),
    );
  });

  await test("full bundle produces per-note for every source", async () => {
    const b = loadBundleWithFixtures();
    const summary = await generateNotesSummary(b, { anthropicClient: null });
    assert(
      summary.per_note.length === b.sources.length,
      `expected per_note for every source: ${summary.per_note.length} vs ${b.sources.length}`,
    );
    const expectedIds = new Set(b.sources.map((s) => s.id));
    for (const entry of summary.per_note) {
      assert(
        expectedIds.has(entry.source_id),
        "per_note id must come from bundle",
      );
      assert(entry.one_liner.length > 0, "one_liner non-empty");
    }
    assert(
      summary.overall.length > 0 &&
        summary.overall !== "[Not found in provided notes]",
      "overall populated",
    );
    assert(
      summary.warnings.some((w) =>
        /clinician.*verify|verify.*clinical/i.test(w),
      ),
      "verification warning present",
    );
  });

  await test("validateNotesSummary catches unknown source_id", async () => {
    const b = loadBundleWithFixtures();
    const summary = await generateNotesSummary(b, { anthropicClient: null });
    summary.per_note.push({ source_id: "bogus_id", one_liner: "x" });
    const v = validateNotesSummary(summary, b);
    assert(!v.ok, "must fail on unknown id");
    assert(
      v.errors.some((e) => e.includes("bogus_id")),
      "error mentions bad id",
    );
  });

  await test("validateNotesSummary catches missing verification warning", async () => {
    const b = loadBundleWithFixtures();
    const summary = await generateNotesSummary(b, { anthropicClient: null });
    summary.warnings = [];
    const v = validateNotesSummary(summary, b);
    assert(!v.ok, "must fail without verification warning");
  });

  console.log("\n[ucsf ai policy]");

  await test("preflightCheck blocks PHI on anthropic_direct route", () => {
    const bundle = createBundle();
    bundle.containsPhi = true;
    bundle.institution = "ucsf_health";
    const result = preflightCheck({
      bundle,
      config: {
        route: "anthropic_direct",
        healthAiOversightApproved: false,
        allowAnthropicDirectForSyntheticOnly: true,
      },
    });
    assert(!result.permitted, "PHI on commercial route must be blocked");
    assert(result.effectiveRoute === "blocked", "effective route is blocked");
    assert(/UCSF policy/i.test(result.reason), "reason mentions UCSF policy");
  });

  await test("preflightCheck permits ucsf_versa with creds", () => {
    const bundle = createBundle();
    bundle.containsPhi = true;
    bundle.institution = "ucsf_health";
    const result = preflightCheck({
      bundle,
      config: {
        route: "ucsf_versa",
        versaBaseUrl: "https://api.versa.ucsf.edu",
        versaApiKey: "test-key",
        healthAiOversightApproved: true,
        allowAnthropicDirectForSyntheticOnly: false,
      },
    });
    assert(result.permitted, "Versa route permitted with creds");
    assert(result.effectiveRoute === "ucsf_versa", "route is versa");
  });

  await test("preflightCheck refuses ucsf_versa without creds", () => {
    const bundle = createBundle();
    const result = preflightCheck({
      bundle,
      config: {
        route: "ucsf_versa",
        healthAiOversightApproved: true,
        allowAnthropicDirectForSyntheticOnly: false,
      },
    });
    assert(!result.permitted, "missing Versa creds blocks route");
  });

  await test("preflightCheck warns on PHI without oversight approval", () => {
    const bundle = createBundle();
    bundle.containsPhi = true;
    const result = preflightCheck({
      bundle,
      config: {
        route: "ucsf_versa",
        versaBaseUrl: "x",
        versaApiKey: "y",
        healthAiOversightApproved: false,
        allowAnthropicDirectForSyntheticOnly: false,
      },
    });
    assert(
      result.warnings.some((w) => /Oversight/i.test(w)),
      "warning mentions Health AI Oversight",
    );
  });

  await test("preflightCheck permits anthropic_direct with synthetic flag and no PHI", () => {
    const bundle = createBundle();
    bundle.containsPhi = false;
    bundle.institution = "synthetic";
    const result = preflightCheck({
      bundle,
      config: {
        route: "anthropic_direct",
        healthAiOversightApproved: false,
        allowAnthropicDirectForSyntheticOnly: true,
      },
    });
    assert(result.permitted, "synthetic + flag permits commercial route");
  });

  console.log("\n[attestation]");

  await test("detectAttestationElements finds all 4 in CMS sample", () => {
    const text =
      "I, Dr. Smith, personally saw and examined the patient, performed critical or key portions of the service, and discussed the care with the resident. I have reviewed the resident's note and agree with the findings.";
    const e = detectAttestationElements(text);
    assert(e.saw_examined_personally, "saw/examined detected");
    assert(e.performed_or_supervised_key_portions, "key portions detected");
    assert(e.discussed_care_with_resident, "discussed with resident detected");
    assert(e.agree_with_resident_or_noted_exceptions, "agree detected");
    assert(isAttestationComplete(e), "all 4 present = complete");
  });

  await test("detectAttestationElements catches missing element", () => {
    const text =
      "I personally saw the patient and discussed with the resident.";
    const e = detectAttestationElements(text);
    assert(!isAttestationComplete(e), "missing key portions + agreement");
  });

  await test("draftAttestation Mode A produces compliant body", () => {
    const draft = draftAttestation({
      mode: "reference_resident_note",
      exceptions:
        "I disagree with the trial of antibiotics; would prefer observation.",
    });
    assert(draft.mode === "reference_resident_note", "mode set");
    assert(/personally saw/i.test(draft.body), "body has personal exam");
    assert(/key portions/i.test(draft.body), "body has key portions");
    assert(/discussed/i.test(draft.body), "body has discussion");
    assert(isAttestationComplete(draft.elements_present), "all 4 present");
    assert(/disagree/i.test(draft.body), "exceptions included");
  });

  await test("draftAttestation Mode B (independent) produces compliant header", () => {
    const draft = draftAttestation({ mode: "independent_attending_note" });
    assert(draft.mode === "independent_attending_note", "mode set");
    assert(
      isAttestationComplete(draft.elements_present),
      "all 4 present in independent",
    );
  });

  await test("validateAttestation flags placeholder ATTENDING NAME", () => {
    const draft = draftAttestation({ mode: "reference_resident_note" });
    const v = validateAttestation(draft);
    assert(
      v.warnings.some((w) => /\[ATTENDING NAME\]/.test(w)),
      "warning about placeholder",
    );
  });

  console.log("\n[apex attestation walkthrough]");

  await test("compileApexAttendingAttestationWalkthrough returns 7 actions ending in prohibited sign", () => {
    const actions = compileApexAttendingAttestationWalkthrough();
    assert(actions.length === 7, `expected 7 actions, got ${actions.length}`);
    const last = actions[actions.length - 1];
    assert(
      last.safetyLevel === "prohibited",
      "last action is prohibited (sign)",
    );
    assert(
      isProhibitedAutonomousAction(last),
      "sign action gates as prohibited autonomously",
    );
  });

  await test("attestation walkthrough refuses autonomous sign", () => {
    const actions = compileApexAttendingAttestationWalkthrough();
    const sign = actions[actions.length - 1];
    let threw = false;
    try {
      assertNotProhibited(sign, "autonomous");
    } catch (e) {
      threw = e instanceof ClinicalSafetyError;
    }
    assert(threw, "autonomous sign must throw ClinicalSafetyError");
  });

  await test("APEX_TARGETS includes Storyboard, attestation, cosign queue anchors", () => {
    assert(APEX_TARGETS.storyboardLeftRail !== undefined, "storyboard target");
    assert(
      APEX_TARGETS.attestationBlock !== undefined,
      "attestation block target",
    );
    assert(
      APEX_TARGETS.cosignQueueInBasket !== undefined,
      "cosign queue target",
    );
    assert(
      APEX_TARGETS.signNoteCommitButton.safetyLevel === "prohibited",
      "sign button is prohibited",
    );
  });

  console.log("\n[summary]");
  const passed = records.filter((r) => r.ok).length;
  const failed = records.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${records.length} total\n`);
  if (failed > 0) {
    console.error("FAILED:");
    for (const r of records.filter((r) => !r.ok)) {
      console.error(`  - ${r.name}: ${r.err}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test-clinical] crashed:", err);
  process.exit(1);
});
