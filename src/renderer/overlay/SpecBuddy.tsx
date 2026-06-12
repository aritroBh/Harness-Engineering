import React from "react";
import type { BehavioralState, SpecMood } from "../../main/session/types";
import {
  usePerimeterRoam,
  type PerimeterRoamResult,
} from "./usePerimeterRoam";
import { ReasoningBubbles, type ReasoningLine } from "./ReasoningBubbles";

interface SpecBuddyProps {
  mood: SpecMood;
  state?: BehavioralState;
  enabled?: boolean;
  checkpointLabel?: string;
  compact?: boolean;
  pitchMode?: boolean;
  reasoningLines?: ReasoningLine[];
  /** When set, roam position is owned by parent (avoids duplicate usePerimeterRoam). */
  roam?: PerimeterRoamResult;
}

function labelForMood(mood: SpecMood, state?: BehavioralState): string {
  if (mood === "flow")
    return `flow ${Math.round((state?.flowScore ?? 0.82) * 100)}%`;
  if (mood === "thinking") return "thinking...";
  if (mood === "stuck") return "stuck on this";
  if (mood === "celebrating") return "checkpoint glow";
  if (mood === "mirroring") return "mirror mode";
  if (mood === "judging") return "judging your click";
  return state
    ? `confidence ${Math.round(state.decisionConfidence * 100)}%`
    : "measuring";
}

function resolveAnimationClass(mood: SpecMood, isMoving: boolean): string {
  if (isMoving) return "spec-buddy__anim--moving";
  if (mood === "thinking") return "spec-buddy__anim--thinking";
  if (mood === "stuck") return "spec-buddy__anim--stuck";
  if (mood === "celebrating") return "spec-buddy__anim--celebrating";
  if (mood === "flow") return "spec-buddy__anim--flow";
  if (mood === "mirroring") return "spec-buddy__anim--mirroring";
  if (mood === "judging") return "spec-buddy__anim--judging";
  return "spec-buddy__anim--idle";
}

function renderEyes(mood: SpecMood) {
  const blush = (
    <>
      <ellipse
        className="spec-buddy__blush"
        cx="21.5"
        cy="38"
        rx="3.6"
        ry="2"
      />
      <ellipse
        className="spec-buddy__blush"
        cx="50.5"
        cy="38"
        rx="3.6"
        ry="2"
      />
    </>
  );

  if (mood === "thinking") {
    return (
      <>
        {blush}
        <path
          className="spec-buddy__brow thin"
          d="M40 22.5c2.2-1.6 4.8-1.6 7 0"
        />
        <circle className="spec-buddy__eye" cx="28.5" cy="31" r="4.4" />
        <circle className="spec-buddy__eye" cx="43.5" cy="30" r="4.4" />
        <circle className="spec-buddy__highlight" cx="30.2" cy="29.2" r="1.5" />
        <circle className="spec-buddy__highlight" cx="45.2" cy="28.2" r="1.5" />
        <circle className="spec-buddy__mouth-o" cx="36" cy="42" r="2.4" />
      </>
    );
  }

  if (mood === "stuck") {
    return (
      <>
        {blush}
        <path
          className="spec-buddy__eye-line"
          d="M24.5 31c2.6-2.4 5.4-2.4 8 0"
        />
        <path
          className="spec-buddy__eye-line"
          d="M39.5 31c2.6-2.4 5.4-2.4 8 0"
        />
        <path
          className="spec-buddy__mouth worried"
          d="M31 41.5c1.7-2 3.3-2 5 0s3.3 2 5 0"
        />
      </>
    );
  }

  if (mood === "flow") {
    return (
      <>
        {blush}
        <circle className="spec-buddy__eye wide" cx="28.5" cy="31" r="5" />
        <circle className="spec-buddy__eye wide" cx="43.5" cy="31" r="5" />
        <circle className="spec-buddy__highlight" cx="30.4" cy="29" r="1.7" />
        <circle className="spec-buddy__highlight" cx="45.4" cy="29" r="1.7" />
        <path
          className="spec-buddy__mouth-open"
          d="M31.5 39.5c1.5 4.5 7.5 4.5 9 0z"
        />
      </>
    );
  }

  if (mood === "celebrating") {
    return (
      <>
        {blush}
        <path
          className="spec-buddy__star-eye"
          d="M28.5 25l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z"
        />
        <path
          className="spec-buddy__star-eye"
          d="M43.5 25l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z"
        />
        <path
          className="spec-buddy__mouth-open"
          d="M31 40c1.7 4.6 8.3 4.6 10 0z"
        />
      </>
    );
  }

  if (mood === "mirroring") {
    return (
      <>
        <ellipse
          className="spec-buddy__eye glow"
          cx="28.5"
          cy="31"
          rx="4.6"
          ry="3.8"
        />
        <ellipse
          className="spec-buddy__eye glow"
          cx="43.5"
          cy="31"
          rx="4.6"
          ry="3.8"
        />
        <path
          className="spec-buddy__mouth calm"
          d="M32 41c2.5 2.4 5.5 2.4 8 0"
        />
      </>
    );
  }

  if (mood === "judging") {
    return (
      <>
        <path
          className="spec-buddy__brow thin"
          d="M23.5 24c2.6-2 5.8-2 8.4-.6"
        />
        <path className="spec-buddy__eye-line judging" d="M24 30.5h9" />
        <path className="spec-buddy__eye-line judging" d="M39 30.5h9" />
        <circle
          className="spec-buddy__pupil judging"
          cx="29"
          cy="32.4"
          r="1.6"
        />
        <circle
          className="spec-buddy__pupil judging"
          cx="44"
          cy="32.4"
          r="1.6"
        />
        <path className="spec-buddy__mouth flat" d="M32.5 42h7" />
      </>
    );
  }

  return (
    <>
      {blush}
      <circle className="spec-buddy__eye" cx="28.5" cy="31" r="4.4" />
      <circle className="spec-buddy__eye" cx="43.5" cy="31" r="4.4" />
      <circle className="spec-buddy__highlight" cx="30.2" cy="29.2" r="1.5" />
      <circle className="spec-buddy__highlight" cx="45.2" cy="29.2" r="1.5" />
      <path
        className="spec-buddy__mouth calm"
        d="M32 40.5c2.5 2.6 5.5 2.6 8 0"
      />
    </>
  );
}

export const SpecBuddy: React.FC<SpecBuddyProps> = ({
  mood,
  state,
  enabled = true,
  checkpointLabel,
  compact = false,
  pitchMode = false,
  reasoningLines = [],
  roam: externalRoam,
}) => {
  const internalRoam = usePerimeterRoam(
    enabled && !externalRoam,
    '[data-specter-boundary="true"]',
    { ghostSize: 56, avoidBottomCenter: true },
  );
  const { x, y, edge, isMoving, transitionDuration } =
    externalRoam ?? internalRoam;

  const animClass = resolveAnimationClass(mood, isMoving);
  const tiltClass = isMoving
    ? edge === "left"
      ? "spec-buddy__body-group--tilt-left"
      : edge === "right"
        ? "spec-buddy__body-group--tilt-right"
        : ""
    : "";

  return (
    <div
      className={`spec-buddy spec-buddy--${mood} ${compact ? "spec-buddy--compact" : ""} ${pitchMode ? "spec-buddy--pitch" : ""}`}
      style={{
        transform: `translate3d(${x - 28}px, ${y - 28}px, 0)`,
        left: 0,
        top: 0,
        transitionDuration: `${transitionDuration}ms`,
      }}
    >
      {pitchMode && (
        <div className="spec-buddy__pitch-tags" aria-hidden="true">
          <span>measured behavior</span>
          <span>real-time mood signal</span>
          <span>versioned checkpoint</span>
          <span>feedback reward</span>
        </div>
      )}

      <div className={`spec-buddy__anim ${animClass}`}>
        <div className="spec-buddy__tilt">
          <div className="spec-buddy__trail" />
          <div className="spec-buddy__stars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <svg
            className="spec-buddy__svg"
            width="72"
            height="78"
            viewBox="0 0 72 78"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="spec-body-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="72%" stopColor="#f3efff" />
                <stop offset="100%" stopColor="#e4dcff" />
              </linearGradient>
              <filter
                id="spec-soft-glow"
                x="-40%"
                y="-40%"
                width="180%"
                height="180%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g className={`spec-buddy__body-group ${tiltClass}`}>
              {/* Stubby waving arms peeking out from the sides */}
              <ellipse
                className="spec-buddy__arm-nub"
                cx="12.5"
                cy="38"
                rx="4.2"
                ry="6"
                transform="rotate(14 12.5 38)"
              />
              <ellipse
                className="spec-buddy__arm-nub"
                cx="59.5"
                cy="38"
                rx="4.2"
                ry="6"
                transform="rotate(-14 59.5 38)"
              />
              {/* Symmetric dome with three soft scallops */}
              <path
                className="spec-buddy__body"
                d="M36 6C21.6 6 12 17.2 12 31.5V60c0 2.2 2.5 3.4 4.2 2l5-4.2 5.2 5.6c1.5 1.6 4 1.6 5.5 0l4.1-4.4 4.1 4.4c1.5 1.6 4 1.6 5.5 0l5.2-5.6 5 4.2c1.7 1.4 4.2.2 4.2-2V31.5C60 17.2 50.4 6 36 6Z"
              />
              <path
                className="spec-buddy__shine"
                d="M21.5 17c2.2-4 5.8-6.8 10-8"
              />
              <circle
                className="spec-buddy__shine-dot"
                cx="19.5"
                cy="22.5"
                r="1.6"
              />
              {mood === "judging" && (
                <>
                  <path
                    className="spec-buddy__arm-cross"
                    d="M24 42c7 3.6 17 3.6 24 0"
                  />
                  <path
                    className="spec-buddy__arm-cross"
                    d="M26 46c6.5 2.8 13.5 2.8 20 0"
                  />
                </>
              )}
            </g>

            <g className="spec-buddy__face-group">{renderEyes(mood)}</g>
          </svg>
        </div>
      </div>

      {!compact && (
        <div className="spec-buddy__checkpoint">{checkpointLabel}</div>
      )}
      {reasoningLines.length > 0 ? (
        <ReasoningBubbles lines={reasoningLines} />
      ) : !compact ? (
        <div className="spec-buddy__label">{labelForMood(mood, state)}</div>
      ) : null}
    </div>
  );
};
