import React, { useEffect, useRef, useState } from "react";
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
  /** Follow the user's real pointer when no step target exists. */
  followPointer?: boolean;
}

const POINTER_POLL_MS = 70;
/** Pixel offset so the ghost hovers beside the real pointer, not under it. */
const POINTER_OFFSET = { x: 30, y: -36 };

export const GhostCursor: React.FC<GhostCursorProps> = ({
  isVisible,
  step,
  isSpeaking = false,
  followPointer = true,
}) => {
  const [dims, setDims] = useState(readViewportDims);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(
    null,
  );
  const stepPos = getStepPosition(step);
  const hasStep = stepPos !== null;

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Without a step target the ghost used to render nothing at all — the
  // overlay had no cursor outside walkthroughs. Track the real pointer via
  // the same main-process IPC the reveal effect uses, so the ghost is always
  // on screen while the overlay is summoned.
  useEffect(() => {
    if (!isVisible || hasStep || !followPointer) return;

    let disposed = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const ipc = (window as any).api;
        const pos = ipc?.getCursorPercent ? await ipc.getCursorPercent() : null;
        const x =
          typeof pos?.x === "number" && Number.isFinite(pos.x) ? pos.x : null;
        const y =
          typeof pos?.y === "number" && Number.isFinite(pos.y) ? pos.y : null;
        if (!disposed && x !== null && y !== null) {
          setPointer({ x, y });
        }
      } catch {
        // keep last known position
      } finally {
        if (!disposed) {
          timer = window.setTimeout(poll, POINTER_POLL_MS);
        }
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isVisible, hasStep, followPointer]);

  const wasFollowingRef = useRef(false);
  const isFollowing = !hasStep && followPointer && pointer !== null;
  useEffect(() => {
    wasFollowingRef.current = isFollowing;
  }, [isFollowing]);

  if (!isVisible) return null;

  // Step target → exact position; otherwise the live pointer; screen center
  // as a last resort so the ghost never silently disappears.
  const pos = stepPos ?? pointer ?? FALLBACK_POSITION;
  const percentX = clampPercent(pos.x);
  const percentY = clampPercent(pos.y);
  const offsetX = hasStep ? 0 : POINTER_OFFSET.x;
  const offsetY = hasStep ? 0 : POINTER_OFFSET.y;

  return (
    <div
      className="openui-ghost-cursor-host"
      style={{
        transform: cursorTransform(percentX, percentY, dims, offsetX, offsetY),
        // Smooth the 70ms pointer polls into a gentle glide; keep step
        // targets snappy so the tail lands exactly where the guide points.
        transition:
          isFollowing && wasFollowingRef.current
            ? `transform ${POINTER_POLL_MS + 30}ms linear`
            : "none",
      }}
    >
      <GhostCursorIcon speaking={isSpeaking} />
    </div>
  );
};
