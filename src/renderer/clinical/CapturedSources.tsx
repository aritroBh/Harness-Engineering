import React from "react";
import type { BundleSummary } from "./ClinicalApp";

export function CapturedSources({
  bundle,
}: {
  bundle: BundleSummary | null;
}): JSX.Element {
  if (!bundle || bundle.sources.length === 0) {
    return (
      <div style={{ padding: 24, color: "#71717a", fontSize: 13 }}>
        No sources captured. Click <strong>Load 5 fixtures</strong> or copy text
        from a note in your EHR and click <strong>Capture clipboard</strong>.
      </div>
    );
  }
  return (
    <div>
      <div style={styles.header}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {bundle.sources.length} source{bundle.sources.length === 1 ? "" : "s"}
        </div>
        <div style={{ fontSize: 12, color: "#71717a" }}>
          capture method: <code>{bundle.captureMethod}</code> · created{" "}
          {new Date(bundle.createdAt).toLocaleTimeString()}
        </div>
      </div>
      <div style={styles.list}>
        {bundle.sources.map((s) => (
          <div key={s.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.id}>{s.id}</span>
              <span style={styles.type}>{s.noteType ?? "note"}</span>
              <span style={styles.chars}>{s.chars} chars</span>
              <span style={styles.hash}>hash {s.contentHash}</span>
            </div>
            <div style={styles.metaRow}>
              {s.author ? (
                <span style={styles.meta}>author: {s.author}</span>
              ) : null}
              {s.service ? (
                <span style={styles.meta}>service: {s.service}</span>
              ) : null}
              {s.sourceScreen ? (
                <span style={styles.meta}>screen: {s.sourceScreen}</span>
              ) : null}
              <span
                style={{
                  ...styles.meta,
                  color: s.hasSections ? "#34d399" : "#fbbf24",
                }}
              >
                {s.hasSections
                  ? "✓ sections extracted"
                  : "⚠ no sections matched"}
              </span>
            </div>
            <pre style={styles.preview}>{s.rawTextPreview}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    marginBottom: 12,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    border: "1px solid #1c2128",
    borderRadius: 10,
    padding: 12,
    background: "#11141a",
  },
  cardHeader: {
    display: "flex",
    gap: 10,
    alignItems: "baseline",
    marginBottom: 4,
  },
  id: {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 12,
    color: "#22d3ee",
  },
  type: {
    fontSize: 12,
    color: "#e6e8eb",
    fontWeight: 600,
  },
  chars: {
    fontSize: 11,
    color: "#71717a",
    marginLeft: "auto",
  },
  hash: {
    fontSize: 11,
    color: "#71717a",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
  },
  metaRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 6,
  },
  meta: {
    fontSize: 11,
    color: "#a1a1aa",
  },
  preview: {
    margin: 0,
    padding: 10,
    background: "#0b0d10",
    border: "1px solid #1c2128",
    borderRadius: 6,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: 11,
    color: "#cbd5e1",
    whiteSpace: "pre-wrap",
    maxHeight: 180,
    overflow: "auto",
  },
};
