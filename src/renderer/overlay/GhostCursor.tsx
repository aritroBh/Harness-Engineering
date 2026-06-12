import React, { useEffect, useState } from "react";
import {
  clampPercent,
  cursorTransform,
  readViewportDims,
} from "./viewportCoords";
import { GhostCursorIcon } from "./GhostCursorIcon";

const FALLBACK_POSITION = { x: 50, y: 50 };

function getStepPosition(step: any): { x: number; y: number } | null {
  if (!step) return null;
  const x = step.viewportX ?? step.x;
  const y = step.viewportY ?? step.y;
  if (x == null || y == null) return null;
  return { x: clampPercent(x), y: clampPercent(y) };
}

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

  if (!isVisible) return null;

  const stepPos = getStepPosition(step);
  const percentX = stepPos?.x ?? FALLBACK_POSITION.x;
  const percentY = stepPos?.y ?? FALLBACK_POSITION.y;

  return (
    <div
      className="openui-ghost-cursor-host"
      style={{
        transform: cursorTransform(percentX, percentY, dims),
      }}
    >
      <GhostCursorIcon speaking={isSpeaking} />
    </div>
  );
};
