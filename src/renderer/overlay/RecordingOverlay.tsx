import React, { useEffect, useRef, useState } from "react";
import { MicRecorder } from "./MicRecorder";

interface RecordingOverlayProps {
  recorder: MicRecorder;
  isTranscribing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const CancelIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M6 6l12 12M18 6L6 18"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const ConfirmIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M5 13l4 4L19 7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const MAX_RECORDING_SECONDS = 30;

export const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  recorder,
  isTranscribing,
  onCancel,
  onConfirm,
  onMouseEnter,
  onMouseLeave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (isTranscribing) return;

    startRef.current = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) {
        window.clearInterval(timer);
        console.log("[MIC] max recording duration reached, auto-stopping");
        onConfirmRef.current();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isTranscribing]);

  useEffect(() => {
    if (isTranscribing) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const levels = recorder.getAudioLevels();
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (levels && levels.length > 0) {
        const barCount = 20;
        const gap = 2;
        const barWidth = (width - (barCount - 1) * gap) / barCount;

        for (let i = 0; i < barCount; i++) {
          const idx = Math.floor((i / barCount) * levels.length);
          const value = levels[idx] || 0;
          const percent = value / 255;
          const barHeight = Math.max(4, percent * height * 0.9);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, "rgba(10, 132, 255, 0.92)");
          gradient.addColorStop(1, "rgba(191, 90, 242, 0.82)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          ctx.fill();
        }
      } else {
        // Fallback pulsing center line when no analyser
        const t = Date.now() / 400;
        const pulse = 0.5 + 0.5 * Math.sin(t);
        const barHeight = Math.max(4, pulse * height * 0.6);
        const barWidth = width * 0.2;
        const x = (width - barWidth) / 2;
        const y = (height - barHeight) / 2;

        ctx.fillStyle = "rgba(10, 132, 255, 0.72)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    console.log("[MIC] waveform active");

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [recorder, isTranscribing]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`recording-overlay ${isTranscribing ? "is-transcribing" : ""}`}
      role="dialog"
      aria-label="Recording overlay"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="recording-overlay-inner">
        <canvas
          ref={canvasRef}
          width={160}
          height={32}
          className="recording-waveform"
          aria-hidden="true"
        />
        <span className="recording-timer">
          {isTranscribing
            ? "Transcribing…"
            : elapsed >= MAX_RECORDING_SECONDS
              ? "Recording limit reached"
              : `Listening… ${formatTime(elapsed)}`}
        </span>
        <div className="recording-overlay-actions">
          <button
            type="button"
            className="recording-overlay-button recording-cancel"
            onClick={onCancel}
            disabled={isTranscribing}
            aria-label="Cancel recording"
            title="Cancel recording"
          >
            <CancelIcon />
          </button>
          <button
            type="button"
            className="recording-overlay-button recording-confirm"
            onClick={onConfirm}
            disabled={isTranscribing}
            aria-label="Transcribe recording"
            title="Transcribe recording"
          >
            <ConfirmIcon />
          </button>
        </div>
      </div>
    </div>
  );
};
