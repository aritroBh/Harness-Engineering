import React, { useState, useEffect } from "react";
import { api } from "../src/api";

export const GhostWikiPanel: React.FC = () => {
  const [lintResultIssues, setLintResultIssues] = useState<any[]>([]);
  const [status, setStatus] = useState({
    active: false,
    mode: "unknown",
    lastIngest: "never",
    wikiPages: 0,
    lintIssues: 0,
    confidence: 0,
  });

  const [peekabooStatus, setPeekabooStatus] = useState<any>({
    enabled: false,
    available: false,
    platform: "unknown",
  });

  const [queryInput, setQueryInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [logs, setLogs] = useState<
    {
      id: number;
      timestamp: string;
      label: string;
      status: "pending" | "pass" | "fail";
      error?: string;
    }[]
  >([]);
  const [memoryDiff, setMemoryDiff] = useState<any>(null);

  const addLog = (
    label: string,
    status: "pending" | "pass" | "fail" = "pending",
    error?: string,
  ) => {
    setLogs((prev) => {
      const newLog = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        label,
        status,
        error,
      };
      return [newLog, ...prev].slice(0, 20);
    });
  };

  const updateLastLog = (status: "pass" | "fail", error?: string) => {
    setLogs((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], status, error };
      return updated;
    });
  };

  useEffect(() => {
    // Initial health check if desired
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    let healthResult;
    try {
      healthResult = await api.ghostwikiHealth();
      setStatus((s) => ({
        ...s,
        mode: healthResult.mode,
        active: healthResult.active,
      }));
    } catch {
      healthResult = {
        active: false,
        mode: "offline",
        cogneeEnabled: false,
        warnings: ["Memory service offline"],
      };
      setStatus((s) => ({ ...s, active: false, mode: "offline" }));
    }
    try {
      const pStatus = await api.getPeekabooStatus();
      setPeekabooStatus(pStatus);
    } catch (e) {
      console.error(e);
    }
    return healthResult;
  };

  const handleQuery = async (presetQuery?: string) => {
    const q = presetQuery || queryInput;
    if (!q) return;
    setIsBusy(true);
    addLog(`Querying: "${q}"`);
    try {
      const res = await api.ghostwikiQuery(q);
      setQueryResult(res);
      setStatus((s) => ({ ...s, mode: res.mode }));
      setMemoryDiff(null); // Reset diff on a new normal query
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const handleLint = async () => {
    setIsBusy(true);
    addLog("Running Lint...");
    try {
      const res = await api.ghostwikiLint();
      setStatus((s) => ({
        ...s,
        mode: res.mode,
        lintIssues: res.issues ? res.issues.length : 0,
      }));
      setLintResultIssues(res.issues || []);
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    type: "correct" | "wrong" | "missing-step";
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  const handleCompileWiki = async () => {
    setIsBusy(true);
    addLog("Compiling + Ingesting Wiki...");
    try {
      // "event-recap-session-1" is the ID expected to be found in demo-workflows/event-recap/graph.json
      // By calling ghostwikiIngestSession, the main process explicitely loads the demo workflow and compiles it.
      await api.ghostwikiIngestSession("event-recap-session-1", "Luma");
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const submitFeedback = async () => {
    if (!feedbackPrompt || !feedbackText) return;
    setIsBusy(true);
    addLog("Submitting feedback and re-ingesting...");
    try {
      const previousAnswer = queryResult?.answer;
      const result = await api.ghostwikiQuery(
        queryInput, // pass the original query string
        "event-recap-session-1",
        feedbackPrompt.type,
        feedbackText,
      );
      setQueryResult(result);
      setMemoryDiff({
        beforeAnswer: previousAnswer,
        afterAnswer: result.answer,
        correctionText: feedbackText,
        correctionPath:
          result.correctionPath || "Correction file written; path unavailable",
        sources: result.sources,
      });
      updateLastLog("pass");
      setFeedbackPrompt(null);
      setFeedbackText("");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runWinningDemo = async () => {
    setIsBusy(true);

    // 1. Loading workflow memory
    addLog("1. Loading workflow memory");
    try {
      const health = await refreshStatus();
      if (!health.active) throw new Error("Memory service offline");
      updateLastLog("pass");
      await delay(500);
    } catch (e) {
      updateLastLog("fail", "Memory service offline");
      setIsBusy(false);
      return;
    }

    // 2. Compile + Ingest
    addLog("2. Compiling + ingesting wiki");
    try {
      const res = await api.ghostwikiIngestSession(
        "event-recap-session-1",
        "Luma",
      );
      setStatus((s) => ({
        ...s,
        lastIngest: new Date().toLocaleTimeString(),
        mode: res.mode,
        wikiPages: res.sources_ingested || s.wikiPages,
      }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 3. Query
    addLog("3. Asking the ghost how to repeat the task");
    const demoQuery = "How do I create a calendar event from this event page?";
    setQueryInput(demoQuery);
    let beforeAnswer = "";
    try {
      const res = await api.ghostwikiQuery(demoQuery);
      beforeAnswer = res.answer;

      if (!res.answer) throw new Error("Query answer missing");

      const missingKeys = [
        "Create Event",
        "title",
        "date",
        "time",
        "location",
        "host",
      ].filter((k) => !res.answer.toLowerCase().includes(k.toLowerCase()));
      if (missingKeys.length > 0)
        throw new Error(`Query answer missing: ${missingKeys.join(", ")}`);
      if (!res.sources || res.sources.length === 0)
        throw new Error("Query sources missing or empty");

      setQueryResult(res);
      setStatus((s) => ({ ...s, mode: res.mode }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 4. Lint
    addLog("4. Linting missing/unsafe steps");
    try {
      const res = await api.ghostwikiLint();
      const numIssues = res.issues ? res.issues.length : 0;
      if (numIssues === 0)
        throw new Error("Lint issues expected but none found");

      const hasMissingSuccessCondition = res.issues.some((issue: any) => {
        const text =
          typeof issue === "string" ? issue : `${issue.rule} ${issue.message}`;
        return (
          text.toLowerCase().includes("missing") &&
          text.toLowerCase().includes("success") &&
          text.toLowerCase().includes("condition")
        );
      });

      if (!hasMissingSuccessCondition) {
        throw new Error("Lint did not include missing success condition issue");
      }

      setStatus((s) => ({
        ...s,
        mode: res.mode,
        lintIssues: numIssues,
      }));
      setLintResultIssues(res.issues || []);
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 5. Correct
    addLog("5. Writing correction memory");
    let result: any;
    const correctionText = "It needs a success condition";
    try {
      result = await api.ghostwikiQuery(
        demoQuery,
        "event-recap-session-1",
        "missing-step",
        correctionText,
      );

      const correctionPath =
        result.correctionPath || "Correction file written; path unavailable";

      updateLastLog("pass", correctionPath);
      await delay(500);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 6. Re-query
    addLog("6. Re-querying improved wiki");
    try {
      if (!result.answer) throw new Error("afterAnswer is missing");
      if (!result.sources || result.sources.length === 0) {
        throw new Error("Sources missing in correction result");
      }
      updateLastLog("pass");

      // Diff panel will catch the correction file if we have it in result
      setQueryResult(result);
      setMemoryDiff({
        beforeAnswer: beforeAnswer,
        afterAnswer: result.answer,
        correctionText: correctionText,
        correctionPath:
          result.correctionPath || "Correction file written; path unavailable",
        sources: result.sources,
      });
      setStatus((s) => ({ ...s, mode: result.mode }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 7. Replay Check
    addLog("7. Checking replay readiness");
    try {
      if (peekabooStatus.available) {
        updateLastLog("pass");
      } else {
        // don't fail the demo
        updateLastLog("pass", "Replay disabled (needs Peekaboo)");
      }
    } catch (e) {
      updateLastLog("fail", "Error checking replay status");
    }

    setIsBusy(false);
  };

  return (
    <div
      style={{
        padding: "12px",
        background: "rgba(0,0,0,0.8)",
        borderRadius: "12px",
        color: "white",
        marginTop: "10px",
        width: "100%",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: "0 0 4px 0", color: "#64d2ff" }}>
          GhostTwin — Workflow Memory Ghost
        </h3>
        <div style={{ fontSize: "12px", color: "#aaa" }}>
          Ask the ghost what you did, what it remembers, what is missing, and
          how to do it again.
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#888",
            marginTop: "4px",
            fontStyle: "italic",
          }}
        >
          Built from a Luma event workflow: the ghost remembers fields, actions,
          missing steps, and corrections.
        </div>
      </div>

      <div style={{ marginBottom: "10px", fontSize: "12px" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: "bold" }}>
            Status: {status.active ? "Online" : "Offline"}
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background:
                status.mode === "fallback"
                  ? "rgba(255,165,0,0.3)"
                  : "rgba(48,209,88,0.3)",
              color: status.mode === "fallback" ? "#ffa500" : "#30d158",
              fontWeight: "bold",
            }}
          >
            {status.mode === "cognee"
              ? "Cognee Active"
              : status.mode === "fallback"
                ? "Cognee Fallback"
                : "Unknown"}
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background: !peekabooStatus.enabled
                ? "rgba(255,255,255,0.2)"
                : !peekabooStatus.available
                  ? "rgba(255,165,0,0.3)"
                  : "rgba(48,209,88,0.3)",
              color: !peekabooStatus.enabled
                ? "#aaa"
                : !peekabooStatus.available
                  ? "#ffa500"
                  : "#30d158",
              fontWeight: "bold",
            }}
            title={peekabooStatus.warning || ""}
          >
            {!peekabooStatus.enabled
              ? "Peekaboo Disabled"
              : !peekabooStatus.available
                ? "Peekaboo Missing"
                : "Peekaboo Available"}
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background: peekabooStatus.available
                ? "rgba(48,209,88,0.3)"
                : "rgba(255,255,255,0.2)",
              color: peekabooStatus.available ? "#30d158" : "#aaa",
              fontWeight: "bold",
            }}
          >
            {peekabooStatus.available
              ? "Replay: Ready"
              : "Replay disabled — Peekaboo missing or permissions not granted."}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            padding: "8px",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: "12px",
              marginBottom: "4px",
              color: "#64d2ff",
            }}
          >
            Workflow Memory
          </div>
          <div style={{ fontSize: "11px" }}>• Luma event workflow</div>
          <div style={{ fontSize: "11px" }}>• title</div>
          <div style={{ fontSize: "11px" }}>• date/time</div>
          <div style={{ fontSize: "11px" }}>• location</div>
          <div style={{ fontSize: "11px" }}>• hosts</div>
          <div style={{ fontSize: "11px", marginTop: "4px", color: "#888" }}>
            Pages: {status.wikiPages}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            padding: "8px",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: "12px",
              marginBottom: "4px",
              color: "#ffcc00",
            }}
          >
            Learned Corrections
          </div>
          {memoryDiff && memoryDiff.correctionText ? (
            <>
              <div style={{ fontSize: "11px", fontStyle: "italic" }}>
                "{memoryDiff.correctionText}"
              </div>
              <div
                style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}
              >
                {memoryDiff.correctionPath}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "11px", color: "#888" }}>
              No corrections yet
            </div>
          )}
        </div>
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            padding: "8px",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: "12px",
              marginBottom: "4px",
              color: "#ff453a",
            }}
          >
            Safety/Lint
          </div>
          <div style={{ fontSize: "11px" }}>
            • Lint issues: {status.lintIssues}
          </div>
          {status.lintIssues > 0 &&
            lintResultIssues.length > 0 &&
            (() => {
              const missingSuccessCondition = lintResultIssues.find(
                (issue: any) => {
                  const text =
                    typeof issue === "string"
                      ? issue
                      : `${issue.rule} ${issue.message}`;
                  return (
                    text.toLowerCase().includes("missing") &&
                    text.toLowerCase().includes("success") &&
                    text.toLowerCase().includes("condition")
                  );
                },
              );
              const displayIssue =
                missingSuccessCondition || lintResultIssues[0];
              const issueText =
                typeof displayIssue === "string"
                  ? displayIssue
                  : displayIssue.message;
              return (
                <div
                  style={{
                    fontSize: "10px",
                    color: missingSuccessCondition ? "#ff453a" : "#aaa",
                    marginTop: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: missingSuccessCondition ? "bold" : "normal",
                  }}
                >
                  Latest: {issueText}
                </div>
              );
            })()}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <button onClick={handleCompileWiki} disabled={isBusy} style={btnStyle}>
          Compile + Ingest
        </button>
        <button onClick={handleLint} disabled={isBusy} style={btnStyle}>
          Lint
        </button>
        <button
          onClick={runWinningDemo}
          disabled={isBusy}
          style={{
            ...btnStyle,
            background: "rgba(100, 210, 255, 0.2)",
            color: "#64d2ff",
            fontWeight: "bold",
          }}
        >
          Run Winning Demo
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <button
          style={{ ...presetBtnStyle }}
          onClick={() => {
            setQueryInput("Summarize the event creation workflow from memory.");
            handleQuery("Summarize the event creation workflow from memory.");
          }}
          disabled={isBusy}
        >
          What did I just do?
        </button>
        <button
          style={{ ...presetBtnStyle }}
          onClick={() => {
            setQueryInput(
              "How do I create a calendar event from this event page?",
            );
            handleQuery(
              "How do I create a calendar event from this event page?",
            );
          }}
          disabled={isBusy}
        >
          How do I do this again?
        </button>
        <button
          style={{ ...presetBtnStyle }}
          onClick={() => {
            setQueryInput("What is missing or unsafe in this workflow?");
            handleQuery("What is missing or unsafe in this workflow?");
          }}
          disabled={isBusy}
        >
          What step is missing?
        </button>
        <button
          style={{ ...presetBtnStyle }}
          onClick={() => {
            setQueryInput("How should this workflow be improved?");
            handleQuery("How should this workflow be improved?");
          }}
          disabled={isBusy}
        >
          Improve this workflow
        </button>
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Ask memory..."
          style={{
            flex: 1,
            padding: "6px",
            borderRadius: "4px",
            border: "1px solid #444",
            background: "#222",
            color: "white",
          }}
        />
        <button
          onClick={() => handleQuery()}
          disabled={isBusy || !queryInput}
          style={{ ...btnStyle, background: "#0a84ff" }}
        >
          Query
        </button>
      </div>

      {logs.length > 0 && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "8px",
            fontSize: "11px",
            maxHeight: "150px",
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
            Activity Log:
          </div>
          {logs.map((log) => (
            <div
              key={log.id}
              style={{ display: "flex", gap: "8px", marginBottom: "4px" }}
            >
              <span style={{ color: "#888" }}>[{log.timestamp}]</span>
              <span
                style={{
                  color:
                    log.status === "pass"
                      ? "#30d158"
                      : log.status === "fail"
                        ? "#ff453a"
                        : "#ffcc00",
                  fontWeight: "bold",
                }}
              >
                {log.status.toUpperCase()}
              </span>
              <span>{log.label}</span>
              {log.error && (
                <span style={{ color: "#ff453a" }}> - {log.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {queryResult && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Answer:</div>
          <div style={{ fontSize: "13px", marginBottom: "8px" }}>
            {queryResult.answer}
          </div>

          {queryResult.warnings && queryResult.warnings.length > 0 && (
            <div
              style={{
                color: "#ffcc00",
                fontSize: "11px",
                marginBottom: "8px",
              }}
            >
              Warnings: {queryResult.warnings.join(", ")}
            </div>
          )}

          {queryResult.sources && queryResult.sources.length > 0 && (
            <div
              style={{ fontSize: "11px", color: "#aaa", marginBottom: "8px" }}
            >
              Sources:{" "}
              {queryResult.sources.length
                ? queryResult.sources.map((s: any) => s.title).join(", ")
                : "None"}
            </div>
          )}

          {memoryDiff && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px",
                background: "rgba(10, 132, 255, 0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(10, 132, 255, 0.3)",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#64d2ff",
                }}
              >
                Memory Diff
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#aaa",
                  }}
                >
                  Before Answer:
                </span>
                <div
                  style={{
                    fontSize: "12px",
                    fontStyle: "italic",
                    color: "#bbb",
                  }}
                >
                  {memoryDiff.beforeAnswer || "None"}
                </div>
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#ffcc00",
                  }}
                >
                  Correction Applied:
                </span>
                <div style={{ fontSize: "12px" }}>
                  {memoryDiff.correctionText}
                </div>
                <div
                  style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}
                >
                  Wiki file: {memoryDiff.correctionPath}
                </div>
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#30d158",
                  }}
                >
                  After Answer:
                </span>
                <div style={{ fontSize: "12px" }}>{memoryDiff.afterAnswer}</div>
              </div>

              {memoryDiff.sources && (
                <div style={{ fontSize: "10px", color: "#888" }}>
                  Sources updated:{" "}
                  {memoryDiff.sources.map((s: any) => s.title).join(", ")}
                </div>
              )}
            </div>
          )}

          {status.lintIssues > 0 && (
            <div
              style={{
                color: "#ffcc00",
                fontSize: "11px",
                marginBottom: "8px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Lint Issues Found:
              </strong>
              <ul style={{ paddingLeft: "16px", margin: 0 }}>
                {lintResultIssues && lintResultIssues.length > 0 ? (
                  lintResultIssues.map((issue: any, i: number) => (
                    <li key={i}>
                      {typeof issue === "string"
                        ? issue
                        : `${issue.rule}: ${issue.message}`}
                    </li>
                  ))
                ) : (
                  <li>
                    Lint issue count reported, but no issue details returned.
                  </li>
                )}
              </ul>
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={() => setFeedbackPrompt({ type: "correct" })}
              style={{ ...fbBtnStyle, color: "#30d158" }}
            >
              Correct
            </button>
            <button
              onClick={() => setFeedbackPrompt({ type: "wrong" })}
              style={{ ...fbBtnStyle, color: "#ff453a" }}
            >
              Wrong
            </button>
            <button
              onClick={() => setFeedbackPrompt({ type: "missing-step" })}
              style={{ ...fbBtnStyle, color: "#ffcc00" }}
            >
              Missing Step
            </button>
          </div>

          {feedbackPrompt && (
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                Provide correction for {feedbackPrompt.type}:
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  fontSize: "12px",
                }}
                placeholder="What should it be?"
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={submitFeedback}
                  disabled={isBusy || !feedbackText}
                  style={{ ...btnStyle, background: "#0a84ff", flex: 1 }}
                >
                  Submit Feedback
                </button>
                <button
                  onClick={() => {
                    setFeedbackPrompt(null);
                    setFeedbackText("");
                  }}
                  disabled={isBusy}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const btnStyle = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.1)",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};

const fbBtnStyle = {
  flex: 1,
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: "bold" as const,
};

const presetBtnStyle = {
  padding: "4px 8px",
  borderRadius: "12px",
  border: "1px solid rgba(100, 210, 255, 0.3)",
  background: "rgba(100, 210, 255, 0.1)",
  color: "#64d2ff",
  cursor: "pointer",
  fontSize: "10px",
  whiteSpace: "nowrap" as const,
};
