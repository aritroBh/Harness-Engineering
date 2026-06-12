import React from "react";

interface SessionPanelProps {
  intent: string;
  nodeId?: string;
  appName?: string;
  isBusy?: boolean;
  isWalkthroughActive?: boolean;
  stepProgress?: number;
  onWalkthrough: () => void;
  onAutoExecute: () => void;
}

export const SessionPanel: React.FC<SessionPanelProps> = ({
  intent,
  nodeId,
  appName,
  isBusy = false,
  isWalkthroughActive = false,
  stepProgress = 0,
  onWalkthrough,
  onAutoExecute,
}) => {
  if (!intent) return null;

  const normalizedStepProgress = Math.min(1, Math.max(0, stepProgress));
  const disabled = isBusy || !nodeId;
  const buttonBase: React.CSSProperties = {
    flex: 1,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "white",
    fontSize: "13px",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "all 0.2s ease",
  };

  return (
    <div
      className="session-panel"
      style={{
        width: "100%",
        background: "rgba(18, 18, 22, 0.76)",
        backdropFilter: "blur(24px)",
        borderRadius: "18px",
        padding: "18px 22px",
        color: "white",
        boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.4)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Goal
          </div>
          <div style={{ fontSize: "18px", fontWeight: 750, marginTop: "2px" }}>
            {intent}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.4)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            App
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.8)",
              marginTop: "2px",
            }}
          >
            {appName || "Unknown"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: isWalkthroughActive
              ? "#30d158"
              : "rgba(255,255,255,0.3)",
          }}
        />
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {isWalkthroughActive ? "Walkthrough in progress" : "Ready to guide"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          width: "100%",
          marginTop: "4px",
        }}
      >
        <button
          disabled={disabled}
          onClick={onWalkthrough}
          style={{
            ...buttonBase,
            background: "rgba(255,255,255,0.1)",
          }}
        >
          Walk me through
        </button>
        <button
          disabled={disabled}
          onClick={onAutoExecute}
          style={{
            ...buttonBase,
            background: "rgba(255,255,255,0.92)",
            color: "#000",
            border: "none",
          }}
        >
          Do it for me
        </button>
      </div>

      {isWalkthroughActive && (
        <div className="progress-bar-container" style={{ marginTop: "4px" }}>
          <div
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.3)",
              fontWeight: 700,
              marginBottom: "6px",
              textAlign: "center",
            }}
          >
            Step Progress
          </div>
          <div
            className="progress-bar"
            style={{
              width: "100%",
              height: "4px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(normalizedStepProgress * 100)}%`,
                height: "100%",
                background: "#fff",
                borderRadius: "2px",
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
