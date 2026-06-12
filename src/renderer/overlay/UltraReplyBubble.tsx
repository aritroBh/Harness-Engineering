import React from "react";

export type UltraState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "waitingForUser"
  | "error"
  | "guiding";

interface UltraReplyBubbleProps {
  reply: string;
  state: UltraState;
  /** True when natural voice is unavailable and macOS TTS fallback is active */
  voiceFallback?: boolean;
}

export const UltraReplyBubble: React.FC<UltraReplyBubbleProps> = ({
  reply,
  state,
  voiceFallback,
}) => {
  if (state === "idle" && !reply) return null;

  const getStateText = () => {
    switch (state) {
      case "listening":
        return "Listening...";
      case "transcribing":
        return "Thinking...";
      case "thinking":
        return "Thinking...";
      case "speaking":
        return voiceFallback ? "Speaking (fallback)..." : "Speaking...";
      case "guiding":
        return "Guiding...";
      case "error":
        return "Error";
      case "waitingForUser":
      case "idle":
      default:
        return "Ready";
    }
  };

  const isBusy = ["listening", "transcribing", "thinking", "speaking"].includes(
    state,
  );

  return (
    <div
      className={`ultra-reply-bubble ${isBusy ? "is-busy" : ""}`}
      style={{
        marginBottom: "12px",
        padding: "12px 16px",
        background: "rgba(18, 18, 22, 0.85)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        color: "#fff",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: isBusy
            ? "rgba(191, 90, 242, 0.9)"
            : "rgba(255, 255, 255, 0.5)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {isBusy && (
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "rgba(191, 90, 242, 0.9)",
              animation: "pulse 1.5s infinite ease-in-out",
            }}
          />
        )}
        {!isBusy && (
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.5)",
            }}
          />
        )}
        {getStateText()}
      </div>

      {reply && (
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            lineHeight: 1.4,
            color: "rgba(255, 255, 255, 0.95)",
          }}
        >
          {reply}
        </div>
      )}

      {voiceFallback && (
        <div
          style={{
            marginTop: "6px",
            padding: "4px 8px",
            background: "rgba(255, 159, 10, 0.12)",
            border: "1px solid rgba(255, 159, 10, 0.25)",
            borderRadius: "8px",
            fontSize: "10px",
            fontWeight: 600,
            color: "rgba(255, 159, 10, 0.85)",
            letterSpacing: "0.2px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>🔇</span>
          <span>Voice fallback active · Text tutoring still works</span>
        </div>
      )}
    </div>
  );
};
