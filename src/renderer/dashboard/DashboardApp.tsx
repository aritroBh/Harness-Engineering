import React, { useCallback, useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    dashboard: {
      listMemories: () => Promise<{
        ok: boolean;
        wikiRoot: string;
        memories: MemoryEntry[];
      }>;
      getProgress: () => Promise<{ ok: boolean; apps: AppProgress[] }>;
    };
  }
}

interface MemoryEntry {
  id: string;
  title: string;
  timestamp: string;
  confidence: number | null;
  tags: string[];
  sourceSessionId: string;
  body: string;
  isCorrection: boolean;
}

interface NodeProgress {
  id: string;
  label: string;
  completed: boolean;
  attempts: number;
  avgStepTimeMs: number;
}

interface AppProgress {
  app: string;
  nodeCount: number;
  completedCount: number;
  nodes: NodeProgress[];
  sessionsCount: number;
  lastSessionAt: string;
  totalStepsRecorded: number;
  behavioralFrameCount: number;
  checkpoints: {
    id: string;
    timestamp: string;
    mood: string;
    flowScore: number | null;
  }[];
}

const colors = {
  bg: "#0c0d12",
  panel: "#15161e",
  panelHover: "#1b1d28",
  border: "#262838",
  text: "#e8e9f0",
  dim: "#8b8fa8",
  accent: "#8b7cf8",
  accentSoft: "rgba(139, 124, 248, 0.14)",
  green: "#4ade80",
  amber: "#fbbf24",
};

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 10);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const Ghost: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C7.6 2 4 5.6 4 10v9.5c0 .5.6.8 1 .5l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.4.3 1 0 1-.5V10c0-4.4-3.6-8-8-8z"
      fill={colors.accent}
      opacity="0.9"
    />
    <circle cx="9.5" cy="10" r="1.4" fill={colors.bg} />
    <circle cx="14.5" cy="10" r="1.4" fill={colors.bg} />
  </svg>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? colors.accentSoft : "transparent",
      color: active ? colors.accent : colors.dim,
      border: `1px solid ${active ? colors.accent : "transparent"}`,
      borderRadius: 8,
      padding: "7px 16px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 120ms ease",
    }}
  >
    {children}
  </button>
);

const StatCard: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div
    style={{
      background: colors.panel,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: "14px 18px",
      minWidth: 120,
    }}
  >
    <div style={{ fontSize: 22, fontWeight: 700, color: colors.text }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: colors.dim, marginTop: 2 }}>{label}</div>
  </div>
);

export const DashboardApp: React.FC = () => {
  const [tab, setTab] = useState<"memories" | "progress">("memories");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [apps, setApps] = useState<AppProgress[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const [mem, prog] = await Promise.all([
        window.dashboard.listMemories(),
        window.dashboard.getProgress(),
      ]);
      if (mem?.ok) setMemories(mem.memories);
      if (prog?.ok) setApps(prog.apps);
      setLastRefresh(Date.now());
    } catch (error) {
      console.error("[DASHBOARD] refresh failed", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const filteredMemories = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [memories, filter]);

  const corrections = memories.filter((m) => m.isCorrection).length;
  const totalSessions = apps.reduce((s, a) => s + a.sessionsCount, 0);
  const totalCompleted = apps.reduce((s, a) => s + a.completedCount, 0);
  const totalNodes = apps.reduce((s, a) => s + a.nodeCount, 0);

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: colors.bg,
        color: colors.text,
        minHeight: "100vh",
        padding: "0 0 40px",
      }}
    >
      {/* Title bar drag region */}
      <div
        style={{
          height: 38,
          // @ts-ignore electron drag region
          WebkitAppRegion: "drag",
        }}
      />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 28px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <Ghost size={34} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>
              Specter Memory
            </h1>
            <div style={{ fontSize: 12, color: colors.dim }}>
              Everything your computer has learned about how you work
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TabButton
              active={tab === "memories"}
              onClick={() => setTab("memories")}
            >
              Memories ({memories.length})
            </TabButton>
            <TabButton
              active={tab === "progress"}
              onClick={() => setTab("progress")}
            >
              Progress
            </TabButton>
          </div>
        </header>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <StatCard label="saved memories" value={memories.length} />
          <StatCard
            label="learned corrections"
            value={
              <span style={{ color: corrections ? colors.amber : colors.text }}>
                {corrections}
              </span>
            }
          />
          <StatCard label="practice sessions" value={totalSessions} />
          <StatCard
            label="skills completed"
            value={
              <span
                style={{ color: totalCompleted ? colors.green : colors.text }}
              >
                {totalCompleted}/{totalNodes}
              </span>
            }
          />
        </div>

        {tab === "memories" && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search memories…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                color: colors.text,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 16,
                outline: "none",
              }}
            />
            {filteredMemories.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: colors.dim,
                  padding: "60px 0",
                  fontSize: 13,
                }}
              >
                No memories yet. Run a workflow with the ghost watching, then
                compile it from the GhostWiki panel.
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              {filteredMemories.map((m) => {
                const isOpen = expanded === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    style={{
                      background: isOpen ? colors.panelHover : colors.panel,
                      border: `1px solid ${
                        m.isCorrection ? colors.amber + "55" : colors.border
                      }`,
                      borderRadius: 12,
                      padding: "14px 18px",
                      cursor: "pointer",
                      transition: "background 120ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
                        {m.title}
                      </span>
                      {m.isCorrection && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: colors.amber,
                            background: "rgba(251,191,36,0.12)",
                            padding: "2px 8px",
                            borderRadius: 99,
                          }}
                        >
                          CORRECTION
                        </span>
                      )}
                      {m.confidence !== null && (
                        <span style={{ fontSize: 11, color: colors.dim }}>
                          {Math.round(m.confidence * 100)}% conf
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: colors.dim }}>
                        {timeAgo(m.timestamp)}
                      </span>
                    </div>
                    {m.tags.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          marginTop: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {m.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10,
                              color: colors.accent,
                              background: colors.accentSoft,
                              padding: "2px 8px",
                              borderRadius: 99,
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {isOpen && (
                      <pre
                        style={{
                          marginTop: 12,
                          padding: 14,
                          background: colors.bg,
                          borderRadius: 8,
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: colors.text,
                          whiteSpace: "pre-wrap",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          maxHeight: 320,
                          overflow: "auto",
                        }}
                      >
                        {m.body}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "progress" && (
          <div style={{ display: "grid", gap: 16 }}>
            {apps.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: colors.dim,
                  padding: "60px 0",
                  fontSize: 13,
                }}
              >
                No learning sessions recorded yet. Summon the ghost (double-tap
                Shift) and ask it to walk you through something.
              </div>
            )}
            {apps.map((app) => (
              <div
                key={app.app}
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>
                    {app.app}
                  </span>
                  <span style={{ fontSize: 12, color: colors.dim }}>
                    {app.sessionsCount} sessions · {app.totalStepsRecorded}{" "}
                    steps recorded · last {timeAgo(app.lastSessionAt)}
                  </span>
                </div>

                {/* completion bar */}
                <div
                  style={{
                    height: 6,
                    background: colors.bg,
                    borderRadius: 99,
                    overflow: "hidden",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${
                        app.nodeCount
                          ? (app.completedCount / app.nodeCount) * 100
                          : 0
                      }%`,
                      background: `linear-gradient(90deg, ${colors.accent}, ${colors.green})`,
                      borderRadius: 99,
                      transition: "width 300ms ease",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {app.nodes.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: colors.bg,
                      }}
                    >
                      <span
                        style={{
                          color: n.completed ? colors.green : colors.dim,
                          fontSize: 14,
                          width: 18,
                        }}
                      >
                        {n.completed ? "✓" : "○"}
                      </span>
                      <span style={{ flex: 1 }}>{n.label}</span>
                      <span style={{ fontSize: 11, color: colors.dim }}>
                        {n.attempts} attempt{n.attempts === 1 ? "" : "s"}
                        {n.avgStepTimeMs
                          ? ` · ${(n.avgStepTimeMs / 1000).toFixed(1)}s/step`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>

                {app.checkpoints.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: colors.dim,
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Behavioral checkpoints
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {app.checkpoints.map((cp) => (
                        <span
                          key={cp.id}
                          title={cp.timestamp}
                          style={{
                            fontSize: 11,
                            color: colors.text,
                            background: colors.bg,
                            border: `1px solid ${colors.border}`,
                            padding: "4px 10px",
                            borderRadius: 99,
                          }}
                        >
                          {cp.mood || "checkpoint"}
                          {cp.flowScore !== null
                            ? ` · flow ${Math.round(cp.flowScore)}`
                            : ""}{" "}
                          · {timeAgo(cp.timestamp)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: 11,
            color: colors.dim,
          }}
        >
          auto-refreshes every 5s
          {lastRefresh
            ? ` · last refresh ${new Date(lastRefresh).toLocaleTimeString()}`
            : ""}
        </div>
      </div>
    </div>
  );
};
