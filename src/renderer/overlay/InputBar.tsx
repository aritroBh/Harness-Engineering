import React, { useRef, useState, useEffect } from "react";
import { Button, IconButton, Input } from "@openuidev/react-ui";
import { MicRecorder } from "./MicRecorder";
import { RecordingOverlay } from "./RecordingOverlay";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onNewChat?: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onRecordingOverlayMouseEnter?: () => void;
  onRecordingOverlayMouseLeave?: () => void;
  mode?: string;
  onUltraSpokenInput?: (text: string) => void;
  onTranscriptionStart?: () => void;
  onTranscriptionEnd?: () => void;
  /** Fired before recording starts — lets the parent release any other mic. */
  onRecordingStart?: () => void;
}

const SpecterMarkIcon = () => (
  <svg className="input-bar-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2.75l1.75 6.05L19.75 7 15.5 11.95l4.25 5-6-1.8L12 21.25l-1.75-6.1-6 1.8 4.25-5L4.25 7l6 1.8L12 2.75z"
      fill="currentColor"
    />
    <circle cx="12" cy="12" r="2.25" fill="rgba(12, 16, 24, 0.92)" />
  </svg>
);

const MicrophoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 0 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M5.75 10.5v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.5v3M9 20.5h6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const MicrophoneMutedIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 0 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M5.75 10.5v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.5v3M9 20.5h6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M4.5 3.5l15 17"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M4 6l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

const SendArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 12h13.5M13.5 6.5 19 12l-5.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

export const InputBar: React.FC<InputBarProps> = ({
  onSubmit,
  onNewChat,
  disabled = false,
  onFocus,
  onBlur,
  onRecordingOverlayMouseEnter,
  onRecordingOverlayMouseLeave,
  mode = "silent",
  onUltraSpokenInput,
  onTranscriptionStart,
  onTranscriptionEnd,
  onRecordingStart,
}) => {
  const recorderRef = useRef(new MicRecorder());
  const [value, setValue] = useState("");
  const [micState, setMicState] = useState<
    "idle" | "recording" | "transcribing" | "error"
  >("idle");
  const [micMessage, setMicMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recordingActiveRef = useRef(false);
  const recordingStartRef = useRef<Promise<void> | null>(null);
  const recorder = recorderRef.current;
  const canSubmit = Boolean(value.trim()) && !disabled;

  useEffect(() => {
    return () => {
      if (recorderRef.current.isRecording) {
        void recorderRef.current.stop().catch(() => undefined);
      }
    };
  }, []);

  // Summoning the overlay (double-shift) lands the caret here immediately.
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    window.addEventListener("specter:focus-input", focusInput);
    return () => window.removeEventListener("specter:focus-input", focusInput);
  }, []);

  const submitValue = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue("");
    setMicMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submitValue();
    }
  };

  const handleNewChat = () => {
    if (disabled) return;
    setValue("");
    onNewChat?.();
  };

  const startRecording = async () => {
    if (disabled || recordingActiveRef.current || micState !== "idle") return;
    onRecordingStart?.();
    setMicMessage("");
    recordingActiveRef.current = true;
    setMicState("recording");
    console.log("[MIC] recording overlay opened");

    recordingStartRef.current = recorder.start();
    try {
      await recordingStartRef.current;
      console.log("[MIC] recording started");
    } catch (error: any) {
      console.error("[InputBar] Microphone recording failed:", error);
      recordingActiveRef.current = false;
      setMicMessage(
        error?.userMessage ||
          "Microphone unavailable. Check permission and try again.",
      );
      setMicState("idle");
    }
  };

  const handleCancel = async () => {
    if (micState !== "recording" || !recordingActiveRef.current) return;
    console.log("[MIC] cancel clicked");
    recordingActiveRef.current = false;
    setMicState("idle");

    try {
      await recordingStartRef.current;
      await recorder.stop();
    } catch (error) {
      console.warn("[MIC] cancel cleanup error", error);
    } finally {
      recordingStartRef.current = null;
    }
    console.log("[MIC] overlay closed");
  };

  const handleConfirm = async () => {
    if (micState !== "recording" || !recordingActiveRef.current) return;
    console.log("[MIC] confirm clicked");
    recordingActiveRef.current = false;
    setMicState("transcribing");

    try {
      await recordingStartRef.current;
      const buffer = await recorder.stop();
      console.log("[MIC] recording stopped");
      if (!buffer.byteLength) {
        setMicMessage("No audio captured. Speak a little longer.");
        setMicState("idle");
        return;
      }

      console.log("[MIC] transcription started", { size: buffer.byteLength });
      onTranscriptionStart?.();
      const result = await Promise.race([
        (window as any).api.transcribe(buffer),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                Object.assign(new Error("Transcription timed out"), {
                  code: "WHISPER_TIMEOUT",
                }),
              ),
            25_000,
          ),
        ),
      ]);

      if (result.ok && typeof result.text === "string" && result.text.trim()) {
        const text = result.text.trim();
        console.log("[MIC] transcription success", { length: text.length });
        if (mode === "ultra" && onUltraSpokenInput) {
          console.log("[MIC] ultra mode auto-submitting transcription");
          onUltraSpokenInput(text);
          setMicState("idle");
        } else {
          setValue(text);
          setMicMessage("");
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }
      } else {
        const msg =
          result.message || "No transcription returned. Try speaking again.";
        setMicMessage(msg);
        console.warn("[MIC] transcription failed/empty", {
          error: result.error,
          message: msg,
        });
      }
    } catch (error: any) {
      console.error("[MIC] transcription failed", error);
      if (error?.code === "WHISPER_TIMEOUT") {
        setMicMessage("Transcription timed out. Try again.");
      } else {
        setMicMessage("Voice transcription failed. You can type instead.");
      }
      setMicState("idle");
    } finally {
      onTranscriptionEnd?.();
      recordingStartRef.current = null;
      setMicState("idle");
      console.log("[MIC] overlay reset to idle");
    }
  };

  useEffect(() => {
    if (micState !== "recording") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void handleCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [micState]);

  const isOverlayVisible =
    micState === "recording" || micState === "transcribing";

  return (
    <div className="input-bar-wrapper">
      {isOverlayVisible && (
        <RecordingOverlay
          recorder={recorder}
          isTranscribing={micState === "transcribing"}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          onMouseEnter={onRecordingOverlayMouseEnter}
          onMouseLeave={onRecordingOverlayMouseLeave}
        />
      )}
      <div className={`input-bar openui-input-bar ${disabled ? "is-disabled" : ""}`}>
        <div className="input-bar-brand" title="Specter" aria-hidden="true">
          <SpecterMarkIcon />
        </div>
        <Input
          ref={inputRef}
          autoFocus
          className="input-bar-field openui-input-field"
          type="text"
          placeholder="Ask Specter about the app in front of you"
          value={value}
          disabled={disabled}
          size="medium"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <div className="input-bar-actions">
          <IconButton
            className={`input-bar-mic-button ${
              micState === "recording"
                ? "is-live"
                : micState === "transcribing"
                  ? "is-transcribing"
                  : "is-muted"
            }`}
            disabled={disabled || micState === "transcribing"}
            variant={micState === "recording" ? "primary" : "secondary"}
            size="small"
            shape="circle"
            icon={
              micState === "recording" || micState === "transcribing" ? (
                <MicrophoneIcon />
              ) : (
                <MicrophoneMutedIcon />
              )
            }
            aria-label={
              micState === "recording"
                ? "Microphone live — click to stop and transcribe"
                : micState === "transcribing"
                  ? "Transcribing..."
                  : "Microphone muted — click to start listening"
            }
            title={
              micState === "recording"
                ? "Mic live — click to stop"
                : micState === "transcribing"
                  ? "Transcribing..."
                  : "Mic muted — click to talk"
            }
            onClick={() => {
              if (micState === "recording") {
                void handleConfirm();
              } else if (micState === "idle") {
                void startRecording();
              }
            }}
          />
          {onNewChat && (
            <Button
              variant="tertiary"
              size="small"
              className="input-bar-new-chat"
              disabled={disabled}
              onClick={handleNewChat}
              iconRight={<ChevronDownIcon />}
              aria-label="Start a new prompt"
            >
              New prompt
            </Button>
          )}
          <IconButton
            className="input-bar-send-button"
            disabled={!canSubmit}
            variant="primary"
            size="small"
            shape="circle"
            icon={<SendArrowIcon />}
            aria-label="Send message"
            title="Send message"
            onClick={submitValue}
          />
        </div>
        {micMessage && (
          <div className="input-bar-mic-message">{micMessage}</div>
        )}
      </div>
    </div>
  );
};
