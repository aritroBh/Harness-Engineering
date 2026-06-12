import React, { useEffect, useRef, useState } from "react";
import { MicRecorder } from "./MicRecorder";
import { RecordingOverlay } from "./RecordingOverlay";
import type { UltraState } from "./UltraReplyBubble";

interface VoiceMicButtonProps {
  disabled?: boolean;
  /** Conversation state from the parent — drives the status pill. */
  conversationState?: UltraState;
  /** True when TTS fell back to the local macOS voice. */
  voiceFallback?: boolean;
  onSpokenInput: (text: string) => void;
  onTranscriptionStart?: () => void;
  onTranscriptionEnd?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Fired before recording starts — lets the parent release any other mic. */
  onRecordingStart?: () => void;
}

const CONVERSATION_LABEL: Record<string, string> = {
  transcribing: "Hearing you…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  disabled = false,
  conversationState = "idle",
  voiceFallback = false,
  onSpokenInput,
  onTranscriptionStart,
  onTranscriptionEnd,
  onMouseEnter,
  onMouseLeave,
  onRecordingStart,
}) => {
  const recorderRef = useRef(new MicRecorder());
  const recordingStartRef = useRef<Promise<void> | null>(null);
  const recordingActiveRef = useRef(false);
  const [micState, setMicState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [micMessage, setMicMessage] = useState("");
  const recorder = recorderRef.current;

  useEffect(() => {
    return () => {
      if (recorderRef.current.isRecording) {
        void recorderRef.current.stop().catch(() => undefined);
      }
    };
  }, []);

  const startRecording = async () => {
    if (disabled || recordingActiveRef.current || micState !== "idle") return;
    onRecordingStart?.();
    setMicMessage("");
    recordingActiveRef.current = true;
    setMicState("recording");

    recordingStartRef.current = recorder.start();
    try {
      await recordingStartRef.current;
    } catch (error: any) {
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
    recordingActiveRef.current = false;
    setMicState("idle");
    try {
      await recordingStartRef.current;
      await recorder.stop();
    } catch {
      /* ignore cleanup errors */
    } finally {
      recordingStartRef.current = null;
    }
  };

  const handleConfirm = async () => {
    if (micState !== "recording" || !recordingActiveRef.current) return;
    recordingActiveRef.current = false;
    setMicState("transcribing");

    try {
      await recordingStartRef.current;
      const buffer = await recorder.stop();
      if (!buffer.byteLength) {
        setMicMessage("No audio captured. Speak a little longer.");
        setMicState("idle");
        return;
      }

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
        onSpokenInput(result.text.trim());
        setMicState("idle");
      } else {
        setMicMessage(
          result.message || "No transcription returned. Try speaking again.",
        );
        setMicState("idle");
      }
    } catch (error: any) {
      setMicMessage(
        error?.code === "WHISPER_TIMEOUT"
          ? "Transcription timed out. Try again."
          : "Voice transcription failed.",
      );
      setMicState("idle");
    } finally {
      onTranscriptionEnd?.();
      recordingStartRef.current = null;
      setMicState("idle");
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

  // While the mic itself is idle, surface what the conversation is doing
  // (thinking, speaking) so a voice-only UI never feels dead.
  const statusLabel =
    micState === "recording"
      ? "Listening… click to send"
      : micState === "transcribing"
        ? "Hearing you…"
        : (CONVERSATION_LABEL[conversationState] ?? "");
  const showStatus = Boolean(statusLabel);

  return (
    <>
      {isOverlayVisible && (
        <RecordingOverlay
          recorder={recorder}
          isTranscribing={micState === "transcribing"}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      )}
      <div
        className="voice-mic-float"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button
          type="button"
          className={`voice-mic-float__btn ${
            micState === "recording"
              ? "is-live"
              : micState === "transcribing" || conversationState === "thinking"
                ? "is-busy"
                : conversationState === "speaking"
                  ? "is-speaking"
                  : "is-ready"
          }`}
          disabled={disabled || micState === "transcribing"}
          onClick={() => {
            if (micState === "recording") {
              void handleConfirm();
            } else if (micState === "idle") {
              void startRecording();
            }
          }}
          aria-label={
            micState === "recording"
              ? "Mic live — click to stop and send"
              : micState === "transcribing"
                ? "Transcribing..."
                : "Click to talk to Specter"
          }
          title={
            micState === "recording"
              ? "Mic live — click to stop"
              : micState === "transcribing"
                ? "Transcribing..."
                : "Click to talk to Specter"
          }
        >
          <span className="voice-mic-float__halo" aria-hidden="true" />
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
        </button>
        {showStatus && (
          <div
            className={`voice-mic-float__status voice-mic-float__status--${
              micState === "recording" ? "live" : conversationState
            }`}
            role="status"
          >
            <span className="voice-mic-float__status-dot" aria-hidden="true" />
            {statusLabel}
            {voiceFallback && conversationState === "speaking" && (
              <span className="voice-mic-float__status-sub">local voice</span>
            )}
          </div>
        )}
        {micMessage && (
          <div className="voice-mic-float__hint">{micMessage}</div>
        )}
      </div>
    </>
  );
};
