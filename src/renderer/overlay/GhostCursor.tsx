import React, { useEffect, useState } from "react";
import {
  clampPercent,
  cursorTransform,
  readViewportDims,
} from "./viewportCoords";
import { GhostCursorIcon } from "./GhostCursorIcon";

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

  const percentX = clampPercent(step.viewportX ?? step.x);
  const percentY = clampPercent(step.viewportY ?? step.y);

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
