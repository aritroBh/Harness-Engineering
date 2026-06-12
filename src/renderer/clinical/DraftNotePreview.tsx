import React from "react";
import type { DraftNote } from "./ClinicalApp";

const SECTION_LABELS: Record<string, string> = {
  chief_complaint: "Chief complaint",
  hpi: "History of present illness",
  past_medical_history: "Past medical history",
  medications: "Medications",
  allergies: "Allergies",
  physical_exam: "Physical exam",
  labs_imaging: "Labs / imaging",
  assessment_and_plan: "Assessment and plan",
};

export function DraftNotePreview({
  draft,
  validation,
}: {
  draft: DraftNote | null;
  validation: { ok: boolean; errors: string[] } | null;
}): JSX.Element {
  if (!draft) {
    return (
      <div style={{ padding: 24, color: "#71717a", fontSize: 13 }}>
        No draft generated yet. Load fixtures, then click{" "}
        <strong>Generate draft</strong>.
      </div>
    );
  }
  return (
    <div>
      <div style={styles.banner}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {draft.draft_note_type}
        </div>
        <div style={styles.meta}>
          generator: <code>{draft.generator}</code> · source_map entries:{" "}
          {draft.source_map.length} · missing:{" "}
          {draft.uncertain_or_missing_info.length}
        </div>
        {validation && !validation.ok ? (
          <div style={styles.invalid}>
            ⚠ validation failed: {validation.errors.join("; ")}
          </div>
        ) : null}
        {validation && validation.ok ? (
          <div style={styles.valid}>✓ validation passed</div>
        ) : null}
      </div>

      <div style={styles.summary}>
        <div style={styles.sectionLabel}>Summary</div>
        <div>{draft.summary}</div>
      </div>

      <div style={styles.warnings}>
        {draft.warnings.map((w, i) => (
          <div key={i} style={styles.warning}>
            ! {w}
          </div>
        ))}
      </div>

      {Object.entries(draft.draft_note).map(([key, value]) => (
        <div key={key} style={styles.section}>
          <div style={styles.sectionLabel}>{SECTION_LABELS[key] ?? key}</div>
          <pre style={styles.body}>{value}</pre>
        </div>
      ))}

      {draft.uncertain_or_missing_info.length > 0 ? (
        <div style={styles.missing}>
          <div style={styles.sectionLabel}>Uncertain / missing</div>
          <ul style={{ marginTop: 6 }}>
            {draft.uncertain_or_missing_info.map((m, i) => (
              <li key={i} style={{ fontSize: 12, color: "#fbbf24" }}>
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={styles.sourceMap}>
        <div style={styles.sectionLabel}>Source map</div>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {draft.source_map.map((entry, i) => (
            <li key={i} style={styles.sourceMapItem}>
              <span style={styles.claim}>{entry.claim}</span>
              <span style={styles.sourceIds}>
                {entry.source_ids.map((id) => (
                  <span key={id} style={styles.sourceId}>
                    {id}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    padding: 14,
    border: "1px solid #1c2128",
    borderRadius: 10,
    background: "#11141a",
    marginBottom: 14,
  },
  meta: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },
  invalid: {
    marginTop: 8,
    color: "#fb7185",
    fontSize: 12,
  },
  valid: {
    marginTop: 8,
    color: "#34d399",
    fontSize: 12,
  },
  summary: {
    marginBottom: 14,
    padding: 12,
    border: "1px solid #1c2128",
    borderRadius: 8,
    fontSize: 13,
    color: "#cbd5e1",
  },
  warnings: {
    marginBottom: 14,
  },
  warning: {
    fontSize: 12,
    color: "#fbbf24",
    padding: "4px 0",
  },
  section: {
    marginBottom: 12,
    padding: 12,
    border: "1px solid #1c2128",
    borderRadius: 8,
    background: "#0d1014",
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#71717a",
    marginBottom: 6,
  },
  body: {
    margin: 0,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    color: "#e6e8eb",
    whiteSpace: "pre-wrap",
  },
  missing: {
    marginBottom: 12,
    padding: 12,
    border: "1px solid #3a2e1c",
    borderRadius: 8,
    background: "#1a140a",
  },
  sourceMap: {
    padding: 12,
    border: "1px solid #1c2128",
    borderRadius: 8,
    background: "#0d1014",
  },
  sourceMapItem: {
    fontSize: 12,
    marginBottom: 6,
    color: "#cbd5e1",
  },
  claim: {
    marginRight: 8,
  },
  sourceIds: {
    display: "inline-flex",
    gap: 4,
  },
  sourceId: {
    fontSize: 10,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#22d3ee",
    background: "#0b1a23",
    border: "1px solid #134e4a",
    padding: "1px 5px",
    borderRadius: 4,
  },
};
