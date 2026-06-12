import React from "react";
import type { CompileResult, DryRunResult } from "./ClinicalApp";

const SAFETY_COLORS: Record<string, string> = {
  read_only: "#22d3ee",
  draft_only: "#a78bfa",
  clinician_confirmed: "#fbbf24",
  prohibited: "#fb7185",
};

const OUTCOME_COLORS: Record<string, string> = {
  executed: "#34d399",
  observed: "#22d3ee",
  paused_for_clinician: "#fbbf24",
  blocked: "#fb7185",
};

export function WorkflowTimeline({
  compiled,
  dryRun,
}: {
  compiled: CompileResult | null;
  dryRun: DryRunResult | null;
}): JSX.Element {
  if (!compiled) {
    return <Empty>Workflow not compiled yet.</Empty>;
  }

  const traceById = new Map<string, any>();
  for (const t of dryRun?.trace ?? []) traceById.set(t.id, t);

  const phases = new Map<string, any[]>();
  for (const a of compiled.actions) {
    const list = phases.get(a.phase) ?? [];
    list.push(a);
    phases.set(a.phase, list);
  }

  return (
    <div>
      <Header
        title={`${compiled.actions.length} semantic actions across ${phases.size} phases`}
        subtitle="Each action declares safety level, preconditions, and postconditions. No raw x/y coordinates."
      />
      {[...phases.entries()].map(([phase, actions]) => (
        <section key={phase} style={styles.phase}>
          <div style={styles.phaseHeader}>{phase}</div>
          <ol style={styles.list}>
            {actions.map((a) => {
              const trace = traceById.get(a.id);
              const safety = SAFETY_COLORS[a.safetyLevel] ?? "#71717a";
              const outcome = trace?.outcome;
              const outcomeColor = outcome
                ? OUTCOME_COLORS[outcome]
                : "#3f3f46";
              return (
                <li key={a.id} style={styles.item}>
                  <div style={styles.itemHeader}>
                    <span
                      style={{
                        ...styles.actionTag,
                        background: outcomeColor + "22",
                        color: outcomeColor,
                        borderColor: outcomeColor + "55",
                      }}
                    >
                      {trace?.outcome ?? "pending"}
                    </span>
                    <span style={styles.actionId}>{a.id}</span>
                    <span
                      style={{
                        ...styles.safetyTag,
                        color: safety,
                        borderColor: safety + "66",
                      }}
                    >
                      {a.safetyLevel}
                    </span>
                  </div>
                  <div style={styles.targetLabel}>
                    {a.action} → {a.semanticTarget.label}
                    {a.semanticTarget.expectedRegion ? (
                      <span style={styles.region}>
                        {" "}
                        · {a.semanticTarget.expectedRegion}
                      </span>
                    ) : null}
                  </div>
                  <div style={styles.reason}>{a.reason}</div>
                  {(a.preconditions?.length || a.postconditions?.length) && (
                    <div style={styles.condRow}>
                      {a.preconditions?.length ? (
                        <span style={styles.cond}>
                          pre: {a.preconditions.join(", ")}
                        </span>
                      ) : null}
                      {a.postconditions?.length ? (
                        <span style={styles.cond}>
                          post: {a.postconditions.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {dryRun ? (
        <div style={styles.summary}>
          dry-run: {dryRun.trace.length} traced · {dryRun.paused.length} paused
          · {dryRun.blocked.length} blocked · final state{" "}
          <code>{dryRun.finalState ?? "∅"}</code>
        </div>
      ) : (
        <div style={styles.summary}>
          Click <strong>Run dry-run</strong> to populate the trace.
        </div>
      )}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, color: "#71717a", fontSize: 13 }}>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  phase: {
    marginBottom: 18,
    border: "1px solid #1c2128",
    borderRadius: 10,
    overflow: "hidden",
  },
  phaseHeader: {
    background: "#11141a",
    padding: "8px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#a1a1aa",
    borderBottom: "1px solid #1c2128",
  },
  list: {
    margin: 0,
    padding: "8px 0",
    listStyle: "none",
  },
  item: {
    padding: "10px 14px",
    borderTop: "1px solid #1c2128",
  },
  itemHeader: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 4,
  },
  actionId: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 12,
    color: "#a1a1aa",
  },
  actionTag: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    padding: "2px 6px",
    borderRadius: 4,
    border: "1px solid",
    letterSpacing: 0.5,
  },
  safetyTag: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    padding: "2px 6px",
    borderRadius: 4,
    border: "1px solid",
    letterSpacing: 0.5,
    marginLeft: "auto",
  },
  targetLabel: {
    fontSize: 13,
    color: "#e6e8eb",
    marginBottom: 2,
  },
  region: {
    color: "#71717a",
    fontSize: 12,
  },
  reason: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  condRow: {
    display: "flex",
    gap: 12,
    marginTop: 4,
    flexWrap: "wrap",
  },
  cond: {
    fontSize: 11,
    color: "#71717a",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
  },
  summary: {
    marginTop: 8,
    padding: 12,
    background: "#11141a",
    border: "1px solid #1c2128",
    borderRadius: 8,
    fontSize: 12,
    color: "#a1a1aa",
  },
};
