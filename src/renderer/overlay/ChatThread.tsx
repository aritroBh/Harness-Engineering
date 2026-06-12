import React, { useEffect, useRef } from "react";
import { UltraState } from "./UltraReplyBubble";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatThreadProps {
  messages: ChatMessage[];
  state: UltraState;
  mode: "silent" | "ultra" | "ghostwiki";
  voiceFallback?: boolean;
}

const GhostAvatar = () => (
  <svg
    className="specter-chat-avatar"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M12 2C7.6 2 4 5.6 4 10v9.5c0 .5.6.8 1 .5l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.4.3 1 0 1-.5V10c0-4.4-3.6-8-8-8z"
      fill="currentColor"
    />
    <circle cx="9.5" cy="10" r="1.3" fill="#0c0d12" />
    <circle cx="14.5" cy="10" r="1.3" fill="#0c0d12" />
  </svg>
);

function stateLabel(state: UltraState, voiceFallback?: boolean): string {
  switch (state) {
    case "listening":
      return "Listening…";
    case "transcribing":
      return "Transcribing…";
    case "speaking":
      return voiceFallback ? "Speaking (fallback voice)…" : "Speaking…";
    case "guiding":
      return "Guiding…";
    default:
      return "";
  }
}

const MAX_VISIBLE = 6;

export const ChatThread: React.FC<ChatThreadProps> = ({
  messages,
  state,
  mode,
  voiceFallback,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, state]);

  const visible = messages.slice(-MAX_VISIBLE);
  const thinking = state === "thinking";
  const statusText = stateLabel(state, voiceFallback);

  if (visible.length === 0 && !thinking && !statusText) return null;

  return (
    <div className="specter-chat-thread" ref={scrollRef}>
      {visible.map((message, index) => (
        <div
          key={`${index}-${message.content.slice(0, 12)}`}
          className={`specter-chat-row ${
            message.role === "user" ? "is-user" : "is-ghost"
          }`}
        >
          {message.role === "assistant" && <GhostAvatar />}
          <div className="specter-chat-bubble">{message.content}</div>
        </div>
      ))}
      {thinking && (
        <div className="specter-chat-row is-ghost">
          <GhostAvatar />
          <div className="specter-chat-bubble specter-chat-typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      {!thinking && statusText && mode === "ultra" && (
        <div className="specter-chat-status">{statusText}</div>
      )}
    </div>
  );
};
