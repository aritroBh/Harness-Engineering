import React, { useEffect, useRef, useState } from "react";
import { useGhostTravel } from "./useGhostTravel";
import {
  clampPercent,
  cursorTransform,
  readViewportDims,
} from "./viewportCoords";

export interface GhostActionPlayerProps {
  step: any;
  isActive: boolean;
  /** Viewport-percent origin for first travel (e.g. idle roam position). */
  start?: { x: number; y: number };
}

const GhostCursorSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path
      d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
      fill="white"
      stroke="black"
      strokeWidth="1"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const GhostActionPlayer: React.FC<GhostActionPlayerProps> = ({
  step,
  isActive,
  start,
}) => {
  const [dims, setDims] = useState(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const target =
    step && (step.viewportX != null || step.x != null)
      ? {
          x: step.viewportX ?? step.x,
          y: step.viewportY ?? step.y,
        }
      : null;

  const { percentX, percentY, isTraveling, isArrived } = useGhostTravel(
    isActive ? target : null,
    { loop: false, travelMs: 550, start },
  );

  const prevPosRef = useRef({ x: percentX, y: percentY });
  const [typingDots, setTypingDots] = useState(".");

  useEffect(() => {
    if (!isTraveling) {
      prevPosRef.current = { x: percentX, y: percentY };
    }
  }, [isTraveling, percentX, percentY]);

  useEffect(() => {
    if (!isArrived || step?.action !== "type") return;
    const id = window.setInterval(() => {
      setTypingDots((current) =>
        current === "." ? ".." : current === ".." ? "..." : ".",
      );
    }, 400);
    return () => window.clearInterval(id);
  }, [isArrived, step?.action]);

  if (!isActive || !step || !target) return null;

  const action = step.action || "click";
  const px = clampPercent(percentX);
  const py = clampPercent(percentY);

  const travelDx = target.x - prevPosRef.current.x;
  const travelDy = target.y - prevPosRef.current.y;
  const travelLen = Math.hypot(travelDx, travelDy) || 1;
  const trailOffsetX = (-travelDx / travelLen) * 6;
  const trailOffsetY = (-travelDy / travelLen) * 6;

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    transform: cursorTransform(px, py, dims),
    pointerEvents: "none",
    zIndex: 9999,
    willChange: "transform",
    transition: isTraveling ? "transform 550ms ease-out" : "none",
    filter: "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.38))",
  };

  if (isTraveling) {
    return (
      <>
        <div
          className="ghost-travel-trail"
          style={{
            ...baseStyle,
            transform: cursorTransform(px, py, dims, trailOffsetX, trailOffsetY),
          }}
        >
          <GhostCursorSvg />
        </div>
        <div style={baseStyle}>
          <GhostCursorSvg />
        </div>
      </>
    );
  }

  if (!isArrived) {
    return (
      <div style={baseStyle}>
        <GhostCursorSvg />
      </div>
    );
  }

  if (action === "click") {
    return (
      <div style={baseStyle}>
        <div className="ghost-action-click">
          <GhostCursorSvg />
        </div>
      </div>
    );
  }

  if (action === "type") {
    const caption = step.typeText ? String(step.typeText).slice(0, 24) : null;
    return (
      <div style={baseStyle}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <GhostCursorSvg />
          <div className="ghost-action-type" />
        </div>
        {caption && (
          <div
            style={{
              marginTop: 4,
              marginLeft: 2,
              fontSize: 10,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              whiteSpace: "nowrap",
            }}
          >
            {caption}
            <span style={{ opacity: 0.7 }}>{typingDots}</span>
          </div>
        )}
      </div>
    );
  }

  if (action === "scroll") {
    return (
      <div style={baseStyle}>
        <div className="ghost-action-scroll">
          <GhostCursorSvg />
        </div>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <div className="ghost-action-wait">
        <GhostCursorSvg />
      </div>
    </div>
  );
};
