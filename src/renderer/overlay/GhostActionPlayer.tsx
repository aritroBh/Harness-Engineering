import React, { useEffect, useRef, useState } from "react";
import { MessageLoading } from "@openuidev/react-ui";
import { useGhostTravel } from "./useGhostTravel";
import { GhostCursorIcon } from "./GhostCursorIcon";
import {
  clampPercent,
  cursorTransform,
  readViewportDims,
} from "./viewportCoords";

const FALLBACK_POSITION = { x: 50, y: 50 };

function getStepPosition(step: any): { x: number; y: number } | null {
  if (!step) return null;
  const x = step.viewportX ?? step.x;
  const y = step.viewportY ?? step.y;
  if (x == null || y == null) return null;
  return { x: clampPercent(x), y: clampPercent(y) };
}

export interface GhostActionPlayerProps {
  step: any;
  isActive: boolean;
  /** Viewport-percent origin for first travel (e.g. idle roam position). */
  start?: { x: number; y: number };
}

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

  const stepPos = getStepPosition(step);
  const target = stepPos || (isActive ? FALLBACK_POSITION : null);

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

  if (!isActive || !step) return null;

  const action = step.action || "click";
  const px = clampPercent(percentX);
  const py = clampPercent(percentY);

  const travelDx = (target?.x ?? px) - prevPosRef.current.x;
  const travelDy = (target?.y ?? py) - prevPosRef.current.y;
  const travelLen = Math.hypot(travelDx, travelDy) || 1;
  const trailOffsetX = (-travelDx / travelLen) * 6;
  const trailOffsetY = (-travelDy / travelLen) * 6;

  const hostStyle: React.CSSProperties = {
    transform: cursorTransform(px, py, dims),
    transition: isTraveling ? "transform 550ms ease-out" : "none",
  };

  if (isTraveling) {
    return (
      <>
        <div
          className="openui-ghost-cursor-host openui-ghost-cursor-host--trail"
          style={{
            ...hostStyle,
            transform: cursorTransform(
              px,
              py,
              dims,
              trailOffsetX,
              trailOffsetY,
            ),
          }}
        >
          <GhostCursorIcon />
        </div>
        <div className="openui-ghost-cursor-host" style={hostStyle}>
          <GhostCursorIcon />
        </div>
      </>
    );
  }

  if (!isArrived) {
    return (
      <div className="openui-ghost-cursor-host" style={hostStyle}>
        <GhostCursorIcon />
      </div>
    );
  }

  if (action === "click") {
    return (
      <div className="openui-ghost-cursor-host" style={hostStyle}>
        <div className="ghost-action-click">
          <GhostCursorIcon expression="excited" />
        </div>
      </div>
    );
  }

  if (action === "type") {
    const caption = step.typeText ? String(step.typeText).slice(0, 24) : null;
    return (
      <div className="openui-ghost-cursor-host" style={hostStyle}>
        <div className="openui-ghost-type-row">
          <GhostCursorIcon />
          <div className="ghost-action-type" />
        </div>
        {caption && (
          <div className="openui-ghost-type-caption">
            {caption}
            <span>{typingDots}</span>
          </div>
        )}
      </div>
    );
  }

  if (action === "scroll") {
    return (
      <div className="openui-ghost-cursor-host" style={hostStyle}>
        <div className="ghost-action-scroll">
          <GhostCursorIcon />
        </div>
      </div>
    );
  }

  return (
    <div className="openui-ghost-cursor-host" style={hostStyle}>
      <div className="ghost-action-wait openui-ghost-wait">
        <GhostCursorIcon expression="thinking" />
        <MessageLoading />
      </div>
    </div>
  );
};
