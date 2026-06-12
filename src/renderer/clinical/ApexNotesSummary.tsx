import React from "react";

interface ApexAction {
  id: string;
  phase: string;
  action: string;
  semanticTarget: { label: string; type?: string; expectedRegion?: string };
  reason: string;
  preconditions?: string[];
  postconditions?: string[];
  safetyLevel: string;
  payload?: { keys?: string[]; text?: string };
}

interface ApexCompletedStep {
  id: string;
  completedAt: string;
  capturedSourceId?: string;
}

export interface ApexSnapshot {
  actions: ApexAction[];
  cursor: number;
  total: number;
  currentAction: ApexAction | null;
  finished: boolean;
  startedAt: string | null;
  completedSteps: ApexCompletedStep[];
  bundleSize: number;
  hasSummary: boolean;
  targets: Record<string, unknown>;
  summary: NotesSummary | null;
}

export interface NotesSummary {
  scope: string;
  overall: string;
  bullets: string[];
  per_note: Array<{
    source_id: string;
    note_type?: string;
    service?: string;
    timestamp?: string;
    one_liner: string;
  }>;
  uncovered: string[];
  warnings: string[];
  generator: "anthropic" | "fixture_grounded_fallback";
}

interface ApexNotesSummaryProps {
  snapshot: ApexSnapshot | null;
  busy: boolean;
  onStart: () => void;
  onAdvance: () => void;
  onRepeat: () => void;
  onReset: () => void;
  onCapture: () => void;
  onGenerateSummary: () => void;
}

const SAFETY_COLOR: Record<string, string> = {
  read_only: "#34d399",
  draft_only: "#60a5fa",
  clinician_confirmed: "#fbbf24",
  prohibited: "#fb7185",
};

function ActionInstruction({ action }: { action: ApexAction }): JSX.Element {
  const keyHint = action.payload?.keys
    ? `  (${action.payload.keys.join("+")})`
    : "";
  return (
    <div>
      <div style={s.instructionTitle}>
        {labelForAction(action.action)}: {action.semanticTarget.label}
        {keyHint}
      </div>
      <div style={s.instructionWhy}>{action.reason}</div>
    </div>
  );
}

function labelForAction(action: string): string {
  switch (action) {
    case "click":
      return "Click";
    case "open_filter":
      return "Open filter";
    case "select_filter_value":
      return "Pick filter value";
    case "iterate_note_rows":
      return "Iterate note rows";
    case "open_note_preview":
      return "Open note preview";
    case "select_text":
      return "Select all text";
    case "copy":
      return "Copy";
    case "wait":
      return "Wait";
    case "wait_for_ui":
      return "Confirm UI";
    case "observe":
      return "Observe";
    default:
      return action;
  }
}

export function ApexNotesSummary({
  snapshot,
  busy,
  onStart,
  onAdvance,
  onRepeat,
  onReset,
  onCapture,
  onGenerateSummary,
}: ApexNotesSummaryProps): JSX.Element {
  if (!snapshot) {
    return <div style={s.empty}>Loading APeX walkthrough…</div>;
  }

  const { actions, cursor, total, currentAction, finished, summary } = snapshot;
  const isCaptureStep = currentAction?.id === "apex.capture_into_bundle";
  const isAdvanceOrFinish = currentAction?.id === "apex.advance_or_finish";
  const summarizeStep = currentAction?.id === "apex.summarize_in_panel";

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div>
          <div style={s.title}>APeX Chart Review · Notes Summary</div>
          <div style={s.subtitle}>
            Guided walkthrough · clinician confirms each step · summary stays in
            this panel and is never written into APeX
          </div>
        </div>
        <div style={s.headerStats}>
          <Stat
            label="step"
            value={`${Math.min(cursor + (finished ? 0 : 1), total)} / ${total}`}
          />
          <Stat label="captured" value={String(snapshot.bundleSize)} />
          <Stat label="summary" value={snapshot.hasSummary ? "ready" : "—"} />
        </div>
      </header>

      <div style={s.controls}>
        <button style={s.btnPrimary} onClick={onStart} disabled={busy}>
          {snapshot.startedAt
            ? "Restart walkthrough"
            : "Start APeX walkthrough"}
        </button>
        <button
          style={s.btn}
          onClick={onAdvance}
          disabled={busy || finished || isCaptureStep}
          title={
            isCaptureStep
              ? "Capture the clipboard first to advance past this step"
              : "Mark current step as done"
          }
        >
          Mark step done
        </button>
        <button
          style={s.btn}
          onClick={onCapture}
          disabled={busy || finished || !isCaptureStep}
          title={
            isCaptureStep
              ? "Read clipboard, dedupe, add to source bundle"
              : "Active only on the capture step"
          }
        >
          Capture clipboard → bundle
        </button>
        {isAdvanceOrFinish && (
          <button style={s.btn} onClick={onRepeat} disabled={busy}>
            Capture another note row
          </button>
        )}
        <button
          style={s.btnAccent}
          onClick={onGenerateSummary}
          disabled={busy || snapshot.bundleSize === 0}
          title={
            snapshot.bundleSize === 0
              ? "No captured notes yet"
              : "Generate read-only summary in this panel"
          }
        >
          {summarizeStep ? "Generate summary now" : "Generate summary"}
        </button>
        <button style={s.btnGhost} onClick={onReset} disabled={busy}>
          Reset
        </button>
      </div>

      <section style={s.scenarioSection}>
        <div style={s.sectionLabel}>Walkthrough</div>
        <ol style={s.stepList}>
          {actions.map((a, idx) => {
            const isCurrent = !finished && idx === cursor;
            const isDone = idx < cursor;
            return (
              <li
                key={a.id}
                style={{
                  ...s.step,
                  ...(isCurrent ? s.stepCurrent : {}),
                  ...(isDone ? s.stepDone : {}),
                }}
              >
                <div style={s.stepHeader}>
                  <span
                    style={{
                      ...s.safetyDot,
                      background: SAFETY_COLOR[a.safetyLevel] || "#71717a",
                    }}
                    title={a.safetyLevel}
                  />
                  <code style={s.stepId}>{a.id}</code>
                  <span style={s.stepSafety}>{a.safetyLevel}</span>
                </div>
                <ActionInstruction action={a} />
                {isCurrent && (
                  <div style={s.currentHint}>
                    {currentHintFor(
                      a,
                      isCaptureStep,
                      isAdvanceOrFinish,
                      summarizeStep,
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <SummaryView summary={summary} />
    </div>
  );
}

function currentHintFor(
  a: ApexAction,
  isCapture: boolean,
  isAdvanceOrFinish: boolean,
  isSummarize: boolean,
): string {
  if (isCapture) {
    return 'Press "Capture clipboard → bundle" once you have copied the note text in APeX.';
  }
  if (isAdvanceOrFinish) {
    return 'Click "Capture another note row" to grab another note, or "Mark step done" to move toward summary.';
  }
  if (isSummarize) {
    return 'Press "Generate summary now" — the result stays in this panel only.';
  }
  if (a.payload?.keys) {
    return `In APeX: press ${a.payload.keys.join("+")} on the current preview.`;
  }
  return "Perform the action in APeX, then mark this step done.";
}

function SummaryView({
  summary,
}: {
  summary: NotesSummary | null;
}): JSX.Element {
  if (!summary) {
    return (
      <section style={s.summarySection}>
        <div style={s.sectionLabel}>Summary</div>
        <div style={s.summaryEmpty}>
          No summary generated yet. Capture one or more notes, then press
          "Generate summary".
        </div>
      </section>
    );
  }

  return (
    <section style={s.summarySection}>
      <div style={s.summaryHeader}>
        <div style={s.sectionLabel}>Summary · {summary.scope}</div>
        <div style={s.generatorBadge}>generator: {summary.generator}</div>
      </div>

      <div style={s.summaryOverall}>{summary.overall}</div>

      {summary.bullets.length > 0 && (
        <div style={s.summaryBlock}>
          <div style={s.summaryBlockLabel}>Highlights</div>
          <ul style={s.bulletList}>
            {summary.bullets.map((b, i) => (
              <li key={i} style={s.bullet}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.per_note.length > 0 && (
        <div style={s.summaryBlock}>
          <div style={s.summaryBlockLabel}>Per-note one-liners</div>
          <ul style={s.bulletList}>
            {summary.per_note.map((entry, i) => (
              <li key={`${entry.source_id}-${i}`} style={s.bullet}>
                <code style={s.sourceTag}>{entry.source_id}</code>
                {entry.note_type ? ` · ${entry.note_type}` : ""}
                {entry.service ? ` · ${entry.service}` : ""} — {entry.one_liner}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.uncovered.length > 0 && (
        <div style={s.summaryBlock}>
          <div style={s.summaryBlockLabel}>Uncovered</div>
          <ul style={s.bulletList}>
            {summary.uncovered.map((u, i) => (
              <li key={i} style={s.bulletMuted}>
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={s.summaryBlock}>
        <div style={s.summaryBlockLabel}>Warnings</div>
        <ul style={s.bulletList}>
          {summary.warnings.map((w, i) => (
            <li key={i} style={s.bulletWarn}>
              {w}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={s.stat}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", gap: 16 },
  empty: { color: "#71717a", padding: 16 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 24,
  },
  title: { fontSize: 15, fontWeight: 700, color: "#e6e8eb" },
  subtitle: { fontSize: 11, color: "#71717a", marginTop: 4, maxWidth: 640 },
  headerStats: { display: "flex", gap: 18 },
  stat: { textAlign: "right", minWidth: 70 },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#e6e8eb",
  },
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    color: "#71717a",
    letterSpacing: 0.6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
    borderBottom: "1px solid #1c2128",
  },
  btnPrimary: {
    background: "#1f6feb",
    color: "white",
    border: "1px solid #1f6feb",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnAccent: {
    background: "#7c3aed",
    color: "white",
    border: "1px solid #7c3aed",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btn: {
    background: "transparent",
    color: "#e6e8eb",
    border: "1px solid #2a2f37",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    color: "#a1a1aa",
    border: "1px solid #2a2f37",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  scenarioSection: {},
  sectionLabel: {
    fontSize: 10,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  stepList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  step: {
    border: "1px solid #1c2128",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#0f1216",
  },
  stepCurrent: {
    border: "1px solid #1f6feb",
    background: "#0c1828",
    boxShadow: "0 0 0 2px rgba(31,111,235,0.15)",
  },
  stepDone: {
    opacity: 0.6,
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  safetyDot: { width: 8, height: 8, borderRadius: 4 },
  stepId: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 11,
    color: "#a1a1aa",
  },
  stepSafety: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#71717a",
  },
  instructionTitle: { fontSize: 13, color: "#e6e8eb", fontWeight: 600 },
  instructionWhy: { fontSize: 12, color: "#a1a1aa", marginTop: 2 },
  currentHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#fbbf24",
    background: "#1a1410",
    border: "1px solid #3f2d0d",
    padding: "6px 10px",
    borderRadius: 6,
  },
  summarySection: {
    marginTop: 8,
    border: "1px solid #1c2128",
    borderRadius: 10,
    padding: 14,
    background: "#0d1014",
  },
  summaryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  generatorBadge: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 11,
    color: "#a1a1aa",
    background: "#161a20",
    border: "1px solid #2a2f37",
    padding: "2px 8px",
    borderRadius: 999,
  },
  summaryEmpty: { fontSize: 12, color: "#71717a" },
  summaryOverall: {
    fontSize: 13,
    color: "#e6e8eb",
    lineHeight: 1.5,
    marginBottom: 12,
  },
  summaryBlock: { marginTop: 12 },
  summaryBlockLabel: {
    fontSize: 10,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  bulletList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  bullet: { fontSize: 12, color: "#e6e8eb", lineHeight: 1.5 },
  bulletMuted: { fontSize: 12, color: "#a1a1aa", lineHeight: 1.5 },
  bulletWarn: { fontSize: 12, color: "#fbbf24", lineHeight: 1.5 },
  sourceTag: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#60a5fa",
    fontSize: 11,
  },
};
