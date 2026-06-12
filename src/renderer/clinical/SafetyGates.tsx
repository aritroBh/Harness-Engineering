import React from "react";
import type { CompileResult, DryRunResult } from "./ClinicalApp";

export function SafetyGates({
  prohibited,
  compiled,
  dryRun,
}: {
  prohibited: string[];
  compiled: CompileResult | null;
  dryRun: DryRunResult | null;
}): JSX.Element {
  const prohibitedActions = (compiled?.actions ?? []).filter(
    (a) => a.safetyLevel === "prohibited",
  );
  const clinicianConfirmed = (compiled?.actions ?? []).filter(
    (a) => a.safetyLevel === "clinician_confirmed",
  );

  return (
    <div>
      <Section title="Prohibited autonomous actions" tone="danger">
        <p style={styles.note}>
          These action names are refused by the runtime safety gate when invoked
          autonomously. The clinician signs every note and order manually.
        </p>
        <ul style={styles.list}>
          {prohibited.map((p) => (
            <li key={p} style={styles.code}>
              {p}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Workflow steps marked prohibited (${prohibitedActions.length})`}
        tone="danger"
      >
        <ul style={styles.list}>
          {prohibitedActions.map((a) => (
            <li key={a.id} style={styles.gateItem}>
              <span style={styles.gateId}>{a.id}</span>
              <span style={styles.gateLabel}>{a.semanticTarget.label}</span>
              <span style={styles.gateReason}>{a.reason}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Clinician-confirmation gates (${clinicianConfirmed.length})`}
        tone="warn"
      >
        <p style={styles.note}>
          These steps pause for explicit clinician confirmation. Replay engine
          will not skip past them autonomously.
        </p>
        <ul style={styles.list}>
          {clinicianConfirmed.map((a) => (
            <li key={a.id} style={styles.gateItem}>
              <span style={styles.gateId}>{a.id}</span>
              <span style={styles.gateLabel}>{a.semanticTarget.label}</span>
              <span style={styles.gateReason}>{a.reason}</span>
            </li>
          ))}
        </ul>
      </Section>

      {dryRun ? (
        <Section title="Last dry-run outcome" tone="info">
          <div style={styles.gridRow}>
            <Stat
              label="executed"
              value={
                dryRun.trace.filter((t) => t.outcome === "executed").length
              }
              accent="#34d399"
            />
            <Stat
              label="observed"
              value={
                dryRun.trace.filter((t) => t.outcome === "observed").length
              }
              accent="#22d3ee"
            />
            <Stat
              label="paused"
              value={dryRun.paused.length}
              accent="#fbbf24"
            />
            <Stat
              label="blocked"
              value={dryRun.blocked.length}
              accent="#fb7185"
            />
          </div>
          {dryRun.errors.length > 0 ? (
            <div style={{ color: "#fb7185", fontSize: 12, marginTop: 8 }}>
              errors: {dryRun.errors.join("; ")}
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "danger" | "warn" | "info";
  children: React.ReactNode;
}) {
  const accent =
    tone === "danger" ? "#fb7185" : tone === "warn" ? "#fbbf24" : "#22d3ee";
  return (
    <section style={{ ...styles.section, borderColor: accent + "44" }}>
      <div style={{ ...styles.sectionTitle, color: accent }}>{title}</div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div style={styles.statBox}>
      <div style={{ ...styles.statValue, color: accent }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 14,
    padding: 14,
    border: "1px solid",
    borderRadius: 10,
    background: "#11141a",
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: 700,
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    color: "#a1a1aa",
    margin: "0 0 8px",
  },
  list: {
    margin: 0,
    paddingLeft: 18,
  },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 12,
    color: "#e6e8eb",
  },
  gateItem: {
    listStyle: "none",
    padding: "6px 0",
    borderTop: "1px solid #1c2128",
    display: "grid",
    gridTemplateColumns: "180px 220px 1fr",
    gap: 10,
    alignItems: "baseline",
    fontSize: 12,
  },
  gateId: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#22d3ee",
  },
  gateLabel: {
    color: "#e6e8eb",
  },
  gateReason: {
    color: "#a1a1aa",
  },
  gridRow: {
    display: "flex",
    gap: 14,
  },
  statBox: {
    minWidth: 80,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
  },
  statLabel: {
    fontSize: 10,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
};
