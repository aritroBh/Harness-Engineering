import { useEffect, useRef, useState } from "react";

export type GhostTravelPhase = "enter" | "travel" | "arrived" | "reset";

const TRAVEL_MS = 600;
const PAUSE_MS = 400;
const PULSE_MS = 600;
const RESET_MS = 100;

export interface GhostTravelTarget {
  x: number;
  y: number;
}

/** Viewport-percent clamp — coordinates arrive over IPC and must never
 * paint the ghost outside the screen. */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface UseGhostTravelOptions {
  loop?: boolean;
  travelMs?: number;
  pauseMs?: number;
  /** Initial travel origin for loop mode (TargetPreviewGhost compat). */
  start?: { x: number; y: number };
  /** When false, loop cycling is paused (TargetPreviewGhost `active` compat). */
  enabled?: boolean;
}

export function useGhostTravel(
  target: GhostTravelTarget | null,
  options?: UseGhostTravelOptions,
) {
  const loop = options?.loop ?? true;
  const travelMs = options?.travelMs ?? TRAVEL_MS;
  const pauseMs = options?.pauseMs ?? PAUSE_MS;
  const enabled = options?.enabled ?? true;

  const [phase, setPhase] = useState<GhostTravelPhase>("enter");
  const startPosRef = useRef(options?.start || { x: 50, y: 50 });
  const lastPosRef = useRef({ x: 50, y: 50 });
  const hasSeededRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  // Lazy ref init during render (not effect) so the very first "enter" frame
  // already paints at the seeded origin — effects run after paint, too late.
  if (!loop && !hasSeededRef.current && options?.start) {
    lastPosRef.current = { x: options.start.x, y: options.start.y };
    hasSeededRef.current = true;
  }

  useEffect(() => {
    if (options?.start) {
      startPosRef.current = options.start;
    }
  }, [options?.start?.x, options?.start?.y]);

  // loop=true — enter → travel → arrived → reset → enter (cycle)
  useEffect(() => {
    if (!loop || !enabled || !target) return;

    if (options?.start) {
      startPosRef.current = options.start;
    }

    const timers: number[] = [];
    timersRef.current = timers;

    const cycle = () => {
      setPhase("travel");
      const t1 = window.setTimeout(() => {
        setPhase("arrived");
        const t2 = window.setTimeout(() => {
          setPhase("reset");
          const t3 = window.setTimeout(() => {
            setPhase("enter");
            const t4 = window.setTimeout(() => {
              cycle();
            }, 50);
            timers.push(t4);
          }, RESET_MS);
          timers.push(t3);
        }, pauseMs + PULSE_MS);
        timers.push(t2);
      }, travelMs);
      timers.push(t1);
    };

    setPhase("enter");
    const t0 = window.setTimeout(() => {
      cycle();
    }, 50);
    timers.push(t0);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    loop,
    enabled,
    target?.x,
    target?.y,
    options?.start?.x,
    options?.start?.y,
    travelMs,
    pauseMs,
  ]);

  // loop=false — single travel on target change, stay at arrived
  useEffect(() => {
    if (loop || !enabled || !target) return;

    const timers: number[] = [];
    timersRef.current = timers;

    setPhase("enter");

    // 50ms (not 16ms) so the browser paints the "enter" frame at the origin
    // before the transform changes — otherwise the CSS transition never fires.
    const t0 = window.setTimeout(() => {
      setPhase("travel");
      const t1 = window.setTimeout(() => {
        setPhase("arrived");
        lastPosRef.current = { x: target.x, y: target.y };
      }, travelMs);
      timers.push(t1);
    }, 50);
    timers.push(t0);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
    // NOTE: options.start intentionally NOT in deps — it seeds lastPosRef once.
    // Including it restarts mid-flight travel on every parent re-render.
  }, [loop, enabled, target?.x, target?.y, travelMs]);

  const percentX = clampPercent(
    loop
      ? phase === "enter" || phase === "reset"
        ? startPosRef.current.x
        : (target?.x ?? startPosRef.current.x)
      : phase === "enter"
        ? lastPosRef.current.x
        : (target?.x ?? lastPosRef.current.x),
  );

  const percentY = clampPercent(
    loop
      ? phase === "enter" || phase === "reset"
        ? startPosRef.current.y
        : (target?.y ?? startPosRef.current.y)
      : phase === "enter"
        ? lastPosRef.current.y
        : (target?.y ?? lastPosRef.current.y),
  );

  return {
    phase,
    percentX,
    percentY,
    isTraveling: phase === "travel",
    isArrived: phase === "arrived",
    travelMs,
  };
}
