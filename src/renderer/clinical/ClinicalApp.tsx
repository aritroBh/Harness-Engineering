import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { CapturedSources } from "./CapturedSources";
import { DraftNotePreview } from "./DraftNotePreview";
import { SafetyGates } from "./SafetyGates";
import {
  ApexNotesSummary,
  type ApexSnapshot,
  type NotesSummary,
} from "./ApexNotesSummary";

declare global {
  interface Window {
    clinical?: ClinicalApi;
  }
}

interface ClinicalApi {
  bundleGet(): Promise<BundleSummary>;
  bundleReset(): Promise<{ ok: boolean }>;
  bundleAddClipboard(meta?: Record<string, unknown>): Promise<CaptureResult>;
  bundleAddManual(
    rawText: string,
    meta?: Record<string, unknown>,
  ): Promise<CaptureResult>;
  bundleAddFixture(
    rawText: string,
    meta?: Record<string, unknown>,
  ): Promise<CaptureResult>;
  workflowCompile(): Promise<CompileResult>;
  workflowDryrun(): Promise<DryRunResult>;
  workflowRun(mode: "dry_run" | "clinician_confirmed"): Promise<DryRunResult>;
  draftGenerate(draftNoteType?: string): Promise<{
    draft: DraftNote;
    validation: { ok: boolean; errors: string[] };
  }>;
  draftGet(): Promise<{
    draft: DraftNote | null;
    validation?: { ok: boolean; errors: string[] };
  }>;
  safetyListProhibited(): Promise<string[]>;
  apexGet(): Promise<ApexSnapshot>;
  apexStart(): Promise<ApexSnapshot>;
  apexReset(): Promise<ApexSnapshot>;
  apexAdvance(opts?: { capturedSourceId?: string }): Promise<ApexSnapshot>;
  apexRepeatIteration(): Promise<ApexSnapshot>;
  apexCaptureClipboard(meta?: Record<string, unknown>): Promise<CaptureResult>;
  apexCaptureManual(
    rawText: string,
    meta?: Record<string, unknown>,
  ): Promise<CaptureResult>;
  apexDryrun(): Promise<DryRunResult>;
  apexSummaryGenerate(scope?: string): Promise<{
    summary: NotesSummary;
    validation: { ok: boolean; errors: string[] };
  }>;
  apexSummaryGet(): Promise<{
    summary: NotesSummary | null;
    validation?: { ok: boolean; errors: string[] };
  }>;
  windowClose(): Promise<{ ok: boolean }>;
  onBundleUpdated(cb: (data: any) => void): () => void;
  onWorkflowTrace(cb: (data: any) => void): () => void;
  onDraftGenerated(cb: (data: any) => void): () => void;
  onApexUpdated(cb: (data: any) => void): () => void;
  onApexSummaryGenerated(cb: (data: any) => void): () => void;
}

export interface BundleSummary {
  patientContext?: {
    patientId?: string;
    encounterId?: string;
    encounterType?: string;
  };
  sources: Array<{
    id: string;
    noteType?: string;
    author?: string;
    service?: string;
    timestamp?: string;
    sourceScreen?: string;
    contentHash: string;
    chars: number;
    rawTextPreview: string;
    hasSections: boolean;
  }>;
  captureMethod: string;
  createdAt: string;
  summary: string;
}

interface CaptureResult {
  added: boolean;
  deduped: boolean;
  bundleSize: number;
  sourceId?: string;
}

export interface CompileResult {
  actions: any[];
  transitions: any[];
  targets: Record<string, any>;
  prohibited: string[];
}

export interface DryRunResult {
  trace: any[];
  transitions: any[];
  paused: any[];
  blocked: any[];
  finalState: string | null;
  errors: string[];
}

export interface DraftNote {
  draft_note_type: string;
  summary: string;
  draft_note: Record<string, string>;
  uncertain_or_missing_info: string[];
  source_map: Array<{ claim: string; source_ids: string[] }>;
  warnings: string[];
  generator: string;
}

type Tab = "apex" | "workflow" | "sources" | "draft" | "safety";

const TAB_LABELS: Record<Tab, string> = {
  apex: "APeX Notes Summary",
  workflow: "Workflow Timeline",
  sources: "Captured Sources",
  draft: "Draft Note",
  safety: "Safety Gates",
};

const FIXTURES: Array<{
  label: string;
  noteType: string;
  service: string;
  idHint: string;
  sourceScreen: string;
  rawText: string;
}> = [
  {
    label: "Inpatient H&P (synthetic)",
    noteType: "Inpatient H&P",
    service: "Hospitalist",
    idHint: "hp",
    sourceScreen: "Chart Review > Notes (Inpatient filter)",
    rawText: `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA
Note Type: Inpatient H&P

Chief Complaint: Abdominal pain and nausea x 2 days.

History of Present Illness: Patient is a 58-year-old presenting with diffuse
abdominal pain, worse in the right lower quadrant, associated with nausea and
two episodes of non-bloody emesis. Pain is rated 8/10, sharp, non-radiating,
worse with movement.

Past Medical History: Hypertension. GERD. Prior appendectomy in childhood.

Medications: lisinopril 10 mg daily, omeprazole 20 mg daily.

Allergies: No known drug allergies.

Physical Exam: Vitals stable, afebrile. Abdomen soft, tender to palpation in
right lower quadrant without rebound or guarding.

Labs: WBC 11.2, lipase normal, lactate 1.6.

Imaging: CT abdomen/pelvis with contrast pending.

Assessment and Plan: 58-year-old with right lower quadrant pain concerning
for inflammatory process. Plan: admit, IV fluids, NPO, surgical consult,
pain control with PRN analgesia.`,
  },
  {
    label: "ED Provider Note (synthetic)",
    noteType: "ED Provider Note",
    service: "Emergency Medicine",
    idHint: "ed_prov",
    sourceScreen: "Notes activity",
    rawText: `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA
Note Type: ED Provider Note

HPI: 58-year-old presenting to ED with two days of progressive abdominal
pain, now localized to right lower quadrant. Patient reports nausea and
emesis.

Physical Exam: Alert, in moderate distress from pain. Abdomen with focal
RLQ tenderness, voluntary guarding, no rebound.

Labs: WBC 11.2 with left shift, lipase normal, UA negative.

Assessment and Plan: Acute abdominal pain, will obtain CT, admit to medicine,
pain control with IV opioid PRN.`,
  },
  {
    label: "ED Triage / Nursing (synthetic)",
    noteType: "ED Triage",
    service: "Nursing",
    idHint: "ed_triage",
    sourceScreen: "Notes activity",
    rawText: `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA
Note Type: ED Triage / Nursing Note

Chief Complaint: "My belly hurts and I keep throwing up."

HPI: Patient arrived via private vehicle. Onset two days ago, worsening
over past 12 hours. Pain 8/10, RLQ.

Allergies: NKDA.

Medications: Reports lisinopril and omeprazole at home.

Physical Exam: Awake, alert, oriented. Holds abdomen. Vital signs normal.

Plan: Triaged ESI 3, IV access, labs drawn.`,
  },
  {
    label: "GI Consult (synthetic)",
    noteType: "GI Consult",
    service: "Gastroenterology",
    idHint: "gi",
    sourceScreen: "Notes activity",
    rawText: `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA
Note Type: Gastroenterology Consult

HPI: 58-year-old admitted with two days of right lower quadrant pain.

Past Medical History: Hypertension, GERD, prior appendectomy.

Imaging: CT abdomen/pelvis — preliminary read notes mild bowel wall
thickening of terminal ileum, no free air.

Assessment and Plan: Possible terminal ileitis. Recommend continue NPO,
IV fluids, repeat labs, consider colonoscopy if symptoms persist.`,
  },
  {
    label: "ED Disposition (synthetic)",
    noteType: "ED Disposition",
    service: "Emergency Medicine",
    idHint: "ed_disp",
    sourceScreen: "Notes activity",
    rawText: `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA
Note Type: ED Disposition / Handoff

HPI: Patient with persistent RLQ pain despite single dose of IV analgesia
in ED. Tolerating small sips of water.

Allergies: NKDA.

Physical Exam at handoff: Vital signs stable. Abdomen unchanged from
arrival.

Assessment and Plan: Admit to medicine. Pain control: continue IV
analgesia PRN for breakthrough pain. NPO overnight.`,
  },
];

export function ClinicalApp(): JSX.Element {
  const [tab, setTab] = useState<Tab>("apex");
  const [bundle, setBundle] = useState<BundleSummary | null>(null);
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [draft, setDraft] = useState<DraftNote | null>(null);
  const [draftValidation, setDraftValidation] = useState<{
    ok: boolean;
    errors: string[];
  } | null>(null);
  const [prohibited, setProhibited] = useState<string[]>([]);
  const [apexSnapshot, setApexSnapshot] = useState<ApexSnapshot | null>(null);
  const [apexBusy, setApexBusy] = useState(false);
  const [status, setStatus] = useState<string>("Ready");
  const [error, setError] = useState<string | null>(null);

  const api = window.clinical;

  const refreshBundle = useCallback(async () => {
    if (!api) return;
    const b = await api.bundleGet();
    setBundle(b);
  }, [api]);

  const refreshApex = useCallback(async () => {
    if (!api) return;
    const snap = await api.apexGet();
    setApexSnapshot(snap);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void refreshBundle();
    void refreshApex();
    void api.workflowCompile().then(setCompiled);
    void api.safetyListProhibited().then(setProhibited);
    const off1 = api.onBundleUpdated(() => void refreshBundle());
    const off2 = api.onDraftGenerated((d: any) => {
      setStatus(`Draft generated (${d?.generator ?? "unknown"})`);
    });
    const off3 = api.onApexUpdated(() => void refreshApex());
    const off4 = api.onApexSummaryGenerated((d: any) => {
      setStatus(
        `APeX summary generated (${d?.generator ?? "unknown"}, ${d?.perNoteCount ?? 0} per-note)`,
      );
      void refreshApex();
    });
    return () => {
      off1?.();
      off2?.();
      off3?.();
      off4?.();
    };
  }, [api, refreshApex, refreshBundle]);

  const guardedRun = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setError(null);
      setStatus(label + "…");
      try {
        await fn();
        setStatus(label + " ✓");
      } catch (e: any) {
        setError(e?.message || String(e));
        setStatus(label + " ✗");
      }
    },
    [],
  );

  const loadAllFixtures = useCallback(async () => {
    if (!api) return;
    await guardedRun("Loading fixtures", async () => {
      await api.bundleReset();
      for (const f of FIXTURES) {
        await api.bundleAddFixture(f.rawText, {
          noteType: f.noteType,
          service: f.service,
          idHint: f.idHint,
          sourceScreen: f.sourceScreen,
        });
      }
      await refreshBundle();
    });
  }, [api, guardedRun, refreshBundle]);

  const runDryRun = useCallback(async () => {
    if (!api) return;
    await guardedRun("Running dry-run", async () => {
      const result = await api.workflowDryrun();
      setDryRun(result);
      setTab("workflow");
    });
  }, [api, guardedRun]);

  const generateDraft = useCallback(async () => {
    if (!api) return;
    await guardedRun("Generating draft", async () => {
      const result = await api.draftGenerate("Inpatient Progress Note");
      setDraft(result.draft);
      setDraftValidation(result.validation);
      setTab("draft");
    });
  }, [api, guardedRun]);

  const captureFromClipboard = useCallback(async () => {
    if (!api) return;
    await guardedRun("Capturing clipboard", async () => {
      await api.bundleAddClipboard({
        noteType: "Captured note",
        sourceScreen: "Manual clipboard capture",
      });
      await refreshBundle();
    });
  }, [api, guardedRun, refreshBundle]);

  const resetBundle = useCallback(async () => {
    if (!api) return;
    await guardedRun("Resetting", async () => {
      await api.bundleReset();
      setDraft(null);
      setDraftValidation(null);
      setDryRun(null);
      await refreshBundle();
      await refreshApex();
    });
  }, [api, guardedRun, refreshApex, refreshBundle]);

  const apexHandlers = useMemo(
    () => ({
      onStart: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Starting APeX walkthrough", async () => {
            const snap = await api.apexStart();
            setApexSnapshot(snap);
            setTab("apex");
          });
        } finally {
          setApexBusy(false);
        }
      },
      onAdvance: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Advancing APeX step", async () => {
            const snap = await api.apexAdvance();
            setApexSnapshot(snap);
          });
        } finally {
          setApexBusy(false);
        }
      },
      onRepeat: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Capturing another note row", async () => {
            const snap = await api.apexRepeatIteration();
            setApexSnapshot(snap);
          });
        } finally {
          setApexBusy(false);
        }
      },
      onReset: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Resetting APeX walkthrough", async () => {
            const snap = await api.apexReset();
            setApexSnapshot(snap);
          });
        } finally {
          setApexBusy(false);
        }
      },
      onCapture: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Capturing clipboard for APeX note", async () => {
            const completedSoFar = apexSnapshot?.completedSteps.length ?? 0;
            const result = await api.apexCaptureClipboard({
              noteType: "APeX Chart Review note",
              idHint: `apex_${completedSoFar + 1}`,
            });
            const snap = await api.apexAdvance({
              capturedSourceId: result.sourceId,
            });
            setApexSnapshot(snap);
            await refreshBundle();
          });
        } finally {
          setApexBusy(false);
        }
      },
      onGenerateSummary: async () => {
        if (!api) return;
        setApexBusy(true);
        try {
          await guardedRun("Generating APeX summary", async () => {
            const result = await api.apexSummaryGenerate(
              "APeX Chart Review > Notes",
            );
            const snap = await api.apexGet();
            setApexSnapshot({ ...snap, summary: result.summary });
            setTab("apex");
          });
        } finally {
          setApexBusy(false);
        }
      },
    }),
    [api, apexSnapshot, guardedRun, refreshBundle],
  );

  const headerStats = useMemo(
    () => ({
      sources: bundle?.sources.length ?? 0,
      actions: compiled?.actions.length ?? 0,
      paused: dryRun?.paused.length ?? 0,
      blocked: dryRun?.blocked.length ?? 0,
    }),
    [bundle, compiled, dryRun],
  );

  if (!api) {
    return (
      <div style={styles.shell}>
        <div style={{ padding: 24, color: "#fb7185" }}>
          Clinical IPC bridge not loaded. Open this window via Cmd+Shift+K from
          a packaged or dev build of Specter.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Specter Clinical</div>
          <div style={styles.subtitle}>
            Synthetic-data dry run · Clinician signs every note &amp; order
            manually
          </div>
        </div>
        <div style={styles.statRow}>
          <Stat label="sources" value={headerStats.sources} />
          <Stat label="actions" value={headerStats.actions} />
          <Stat label="paused" value={headerStats.paused} accent="#fbbf24" />
          <Stat label="blocked" value={headerStats.blocked} accent="#fb7185" />
        </div>
      </header>

      <nav style={styles.tabRow}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <section style={styles.actionRow}>
        <ActionButton onClick={loadAllFixtures}>Load 5 fixtures</ActionButton>
        <ActionButton onClick={captureFromClipboard}>
          Capture clipboard
        </ActionButton>
        <ActionButton onClick={runDryRun}>Run dry-run</ActionButton>
        <ActionButton
          onClick={generateDraft}
          disabled={(bundle?.sources.length ?? 0) === 0}
        >
          Generate draft
        </ActionButton>
        <ActionButton onClick={resetBundle} variant="ghost">
          Reset
        </ActionButton>
        <div style={styles.spacer} />
        <div
          style={{ ...styles.statusPill, color: error ? "#fb7185" : "#a1a1aa" }}
        >
          {error ? "error: " + error : status}
        </div>
      </section>

      <main style={styles.main}>
        {tab === "apex" && (
          <ApexNotesSummary
            snapshot={apexSnapshot}
            busy={apexBusy}
            onStart={apexHandlers.onStart}
            onAdvance={apexHandlers.onAdvance}
            onRepeat={apexHandlers.onRepeat}
            onReset={apexHandlers.onReset}
            onCapture={apexHandlers.onCapture}
            onGenerateSummary={apexHandlers.onGenerateSummary}
          />
        )}
        {tab === "workflow" && (
          <WorkflowTimeline compiled={compiled} dryRun={dryRun} />
        )}
        {tab === "sources" && <CapturedSources bundle={bundle} />}
        {tab === "draft" && (
          <DraftNotePreview draft={draft} validation={draftValidation} />
        )}
        {tab === "safety" && (
          <SafetyGates
            prohibited={prohibited}
            compiled={compiled}
            dryRun={dryRun}
          />
        )}
      </main>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "ghost";
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    background: variant === "ghost" ? "transparent" : "#1f6feb",
    color: variant === "ghost" ? "#a1a1aa" : "white",
    border: variant === "ghost" ? "1px solid #2a2f37" : "1px solid #1f6feb",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
  return (
    <button onClick={onClick} disabled={disabled} style={base}>
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statValue, color: accent ?? "#e6e8eb" }}>
        {value}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0b0d10",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px 12px",
    borderBottom: "1px solid #1c2128",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 4,
  },
  statRow: {
    display: "flex",
    gap: 18,
  },
  stat: {
    minWidth: 60,
    textAlign: "right",
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
  },
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    color: "#71717a",
    letterSpacing: 0.6,
  },
  tabRow: {
    display: "flex",
    padding: "0 16px",
    borderBottom: "1px solid #1c2128",
  },
  tab: {
    background: "transparent",
    color: "#71717a",
    border: "none",
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
  },
  tabActive: {
    color: "#e6e8eb",
    borderBottom: "2px solid #1f6feb",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid #1c2128",
  },
  spacer: { flex: 1 },
  statusPill: {
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: "16px 20px",
  },
};
