import React, { useEffect, useState } from "react";
import { useGhostTravel } from "./useGhostTravel";
import { cursorTransform, readViewportDims } from "./viewportCoords";

interface PreviewTarget {
  x: number;
  y: number;
  label?: string;
}

interface TargetPreviewGhostProps {
  target: PreviewTarget | null;
  start?: { x: number; y: number };
  active: boolean;
}

export const TargetPreviewGhost: React.FC<TargetPreviewGhostProps> = ({
  target,
  start,
  active,
}) => {
  const [dims, setDims] = useState(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { phase, percentX, percentY, isTraveling, isArrived, travelMs } =
    useGhostTravel(active && target ? target : null, {
      loop: true,
      start,
      enabled: active,
    });

  useEffect(() => {
    if (!target) return;
    console.log("[PREVIEW_GHOST] target preview", {
      label: target.label || "unknown",
      x: target.x,
      y: target.y,
      sourceFrame: "viewport",
    });
  }, [target?.x, target?.y, target?.label]);

  useEffect(() => {
    if (phase === "arrived" && target) {
      console.log("[PREVIEW_GHOST] endpoint", {
        label: target.label || "unknown",
        x: target.x,
        y: target.y,
      });
    }
  }, [phase, target]);

  if (!active || !target) return null;

  const isReset = phase === "reset";

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: cursorTransform(percentX, percentY, dims),
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform, opacity",
        transition: isTraveling
          ? `transform ${travelMs}ms ease-out, opacity ${travelMs}ms ease-out`
          : "none",
        opacity: isReset ? 0 : 0.88,
        filter: "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.38))",
      }}
    >
      <div className={isArrived ? "target-preview-ghost-pulse" : ""}>
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
      </div>
    </div>
  );
};
