import React, { useEffect, useState } from "react";
import { GhostCursorIcon } from "./GhostCursorIcon";
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
      className="openui-ghost-cursor-host openui-ghost-preview-host"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 9999,
        transform: cursorTransform(percentX, percentY, dims),
        transition: isTraveling
          ? `transform ${travelMs}ms ease-out, opacity ${travelMs}ms ease-out`
          : "none",
        opacity: isReset ? 0 : 0.92,
      }}
    >
      <div
        className={
          isArrived ? "target-preview-ghost-pulse openui-ghost-preview" : ""
        }
      >
        <GhostCursorIcon expression="wink" size={34} />
      </div>
    </div>
  );
};
