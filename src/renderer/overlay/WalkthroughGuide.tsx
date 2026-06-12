import React, { useEffect, useState } from "react";
import {
  clampPercent,
  centerTransform,
  readViewportDims,
} from "./viewportCoords";

interface WalkthroughGuideProps {
  step: any;
}

export const WalkthroughGuide: React.FC<WalkthroughGuideProps> = ({ step }) => {
  const [dims, setDims] = useState(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!step || step.type === "idle") return null;

  const x = clampPercent(step.viewportX ?? step.x ?? 50);
  const y = clampPercent(step.viewportY ?? step.y ?? 50);
  const bubbleOnLeft = x > 70;
  const bubbleAbove = y > 72;
  const hasHint = Boolean(step.instruction || step.targetLabel);
  const isLocked = step.ghostLocked === true;
  const isWait = step.action === "wait";

  return (
    <div
      className={`walkthrough-guide-container ${isLocked ? "is-locked" : ""} ${isWait ? "is-wait" : ""}`}
      style={{
        transform: centerTransform(x, y, dims),
      }}
    >
      <div className="walkthrough-guide-ring" />
      <div className="walkthrough-guide-dot" />

      {hasHint && (
        <div
          className={[
            "walkthrough-guide-bubble",
            bubbleOnLeft ? "is-left" : "is-right",
            bubbleAbove ? "is-above" : "is-below",
          ].join(" ")}
        >
          {step.instruction || step.targetLabel}
        </div>
      )}
    </div>
  );
};
