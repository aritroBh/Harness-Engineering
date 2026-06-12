import React from "react";

interface ModeToggleProps {
  mode: "silent" | "ultra" | "ghostwiki";
  onChange: (mode: "silent" | "ultra") => void;
  memoryOpen: boolean;
  onToggleMemory: () => void;
}

const ChatIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const VoiceIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MemoryIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C7.6 2 4 5.6 4 10v9.5c0 .5.6.8 1 .5l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.3.2.7.2 1 0l2-1.6 2 1.6c.4.3 1 0 1-.5V10c0-4.4-3.6-8-8-8z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    <circle cx="14.5" cy="10.5" r="1" fill="currentColor" />
  </svg>
);

export const ModeToggle: React.FC<ModeToggleProps> = ({
  mode,
  onChange,
  memoryOpen,
  onToggleMemory,
}) => {
  return (
    <div className="specter-mode-row">
      <div className="specter-mode-toggle" role="tablist" aria-label="Mode">
        <div
          className="specter-mode-thumb"
          style={{
            transform: mode === "ultra" ? "translateX(100%)" : "translateX(0%)",
          }}
        />
        <button
          role="tab"
          aria-selected={mode !== "ultra"}
          className={`specter-mode-option ${mode !== "ultra" ? "is-active" : ""}`}
          onClick={() => onChange("silent")}
        >
          <ChatIcon />
          <span>Chat</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "ultra"}
          className={`specter-mode-option ${mode === "ultra" ? "is-active" : ""}`}
          onClick={() => onChange("ultra")}
        >
          <VoiceIcon />
          <span>Voice</span>
        </button>
      </div>
      <button
        className={`specter-memory-button ${memoryOpen ? "is-open" : ""}`}
        onClick={onToggleMemory}
        title="Workflow memory"
        aria-pressed={memoryOpen}
      >
        <MemoryIcon />
        <span>Memory</span>
      </button>
    </div>
  );
};
