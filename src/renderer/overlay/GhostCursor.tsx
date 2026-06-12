import React, { useEffect, useState } from "react";
import {
  clampPercent,
  cursorTransform,
  readViewportDims,
} from "./viewportCoords";

let stylesInjected = false;

interface GhostCursorProps {
  isVisible: boolean;
  mood?: string;
  step?: any;
  isSpeaking?: boolean;
}

export const GhostCursor: React.FC<GhostCursorProps> = ({
  isVisible,
  step,
  isSpeaking = false,
}) => {
  const [dims, setDims] = useState(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!isVisible || !step) return null;

  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ghost-speak-pulse {
        0%, 100% { transform: scale(1.0); filter: drop-shadow(0 3px 5px rgba(0,0,0,0.38)); }
        50% { transform: scale(1.11); filter: drop-shadow(0 0 10px rgba(180,140,255,0.88)) drop-shadow(0 3px 5px rgba(0,0,0,0.38)); }
      }
      @keyframes ghost-speak-wave {
        0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.7); }
        40%  { opacity: 0.45; }
        100% { opacity: 0;    transform: translate(-50%, -50%) scale(1.6); }
      }
    `;
    document.head.appendChild(style);
  }

  const percentX = clampPercent(step.viewportX ?? step.x);
  const percentY = clampPercent(step.viewportY ?? step.y);

  const svg = (
    <svg width="24" height="24" viewBox="0 0 24 24">
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

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: cursorTransform(percentX, percentY, dims),
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      {isSpeaking ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              animation:
                "ghost-speak-pulse 240ms ease-in-out infinite alternate",
            }}
          >
            {svg}
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1.5px solid rgba(180,140,255,0.55)",
              pointerEvents: "none",
              animation: "ghost-speak-wave 520ms ease-out infinite",
              animationDelay: "0ms",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1.5px solid rgba(180,140,255,0.55)",
              pointerEvents: "none",
              animation: "ghost-speak-wave 520ms ease-out infinite",
              animationDelay: "260ms",
            }}
          />
        </div>
      ) : (
        svg
      )}
    </div>
  );
};
