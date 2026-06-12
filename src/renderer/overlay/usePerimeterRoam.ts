import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";

export type Edge = "top" | "right" | "bottom" | "left";

interface Point {
  x: number;
  y: number;
}

export interface UsePerimeterRoamOptions {
  ghostSize?: number;
  padding?: number;
  topPadding?: number;
  minTravelMs?: number;
  maxTravelMs?: number;
  minPauseMs?: number;
  maxPauseMs?: number;
  avoidBottomCenter?: boolean;
}

const DEFAULTS = {
  ghostSize: 56,
  padding: 12,
  topPadding: 16, // Extra safe area for macOS menu bar / edge glow
  minTravelMs: 4000,
  maxTravelMs: 9000,
  minPauseMs: 1000,
  maxPauseMs: 3000,
};

function getBounds(
  boundaryRefOrSelector?: RefObject<HTMLElement> | string,
): DOMRect {
  if (typeof boundaryRefOrSelector === "string") {
    const el = document.querySelector(boundaryRefOrSelector);
    if (el) return el.getBoundingClientRect();
  } else if (boundaryRefOrSelector?.current) {
    return boundaryRefOrSelector.current.getBoundingClientRect();
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

export interface PerimeterRoamResult {
  x: number;
  y: number;
  edge: Edge;
  isMoving: boolean;
  isPaused: boolean;
  transitionDuration: number;
}

export function mapOffsetToPerimeterPoint(
  offset: number,
  rawRect: DOMRect,
  ghostSize: number,
  padding: number,
  topPadding: number,
  avoidBottomCenter: boolean,
): { x: number; y: number; edge: Edge; totalLen: number } {
  const ghostRadius = ghostSize / 2;

  const safeLeft = rawRect.left + padding + ghostRadius;
  const safeTop = rawRect.top + padding + ghostRadius + topPadding;
  const safeRight = Math.max(safeLeft, rawRect.right - padding - ghostRadius);
  const safeBottom = Math.max(safeTop, rawRect.bottom - padding - ghostRadius);

  const topLen = Math.max(0, safeRight - safeLeft);
  const rightLen = Math.max(0, safeBottom - safeTop);
  const bottomLen = Math.max(0, safeRight - safeLeft);
  const leftLen = Math.max(0, safeBottom - safeTop);

  const totalLen = topLen + rightLen + bottomLen + leftLen;

  if (totalLen <= 0) {
    return { x: safeLeft, y: safeTop, edge: "top", totalLen: 1 };
  }

  let normalizedOffset = offset % totalLen;
  if (normalizedOffset < 0) normalizedOffset += totalLen;

  let x = 0;
  let y = 0;
  let edge: Edge = "top";

  let remaining = normalizedOffset;

  if (remaining < topLen) {
    x = safeLeft + remaining;
    y = safeTop;
    edge = "top";
  } else {
    remaining -= topLen;
    if (remaining < rightLen) {
      x = safeRight;
      y = safeTop + remaining;
      edge = "right";
    } else {
      remaining -= rightLen;
      if (remaining < bottomLen) {
        let bottomOffset = remaining;
        if (avoidBottomCenter) {
          const leftBound = bottomLen * 0.25;
          const rightBound = bottomLen * 0.75;
          if (bottomOffset > leftBound && bottomOffset < rightBound) {
            // Snap to the edge of the avoid zone
            if (bottomOffset < bottomLen * 0.5) {
              bottomOffset = leftBound;
            } else {
              bottomOffset = rightBound;
            }
          }
        }
        x = safeRight - bottomOffset;
        y = safeBottom;
        edge = "bottom";
      } else {
        remaining -= bottomLen;
        x = safeLeft;
        y = safeBottom - remaining;
        edge = "left";
      }
    }
  }

  return { x, y, edge, totalLen };
}

export function usePerimeterRoam(
  enabled: boolean,
  boundaryRefOrSelector?: RefObject<HTMLElement> | string,
  options?: UsePerimeterRoamOptions,
): PerimeterRoamResult {
  const {
    ghostSize = DEFAULTS.ghostSize,
    padding = DEFAULTS.padding,
    topPadding = DEFAULTS.topPadding,
    avoidBottomCenter = false,
  } = options || {};

  const [position, setPosition] = useState<Point>({ x: -1000, y: -1000 });
  const [edge, setEdge] = useState<Edge>("top");
  const [isPaused, setIsPaused] = useState(false);

  const stateRef = useRef({
    offset: -1, // Uninitialized flag
    direction: 1 as 1 | -1,
    speed: 50,
    isPaused: false,
    lastTime: performance.now(),
    rect: null as DOMRect | null,
  });

  const reducedMotionRef = useRef(false);
  const isMountedRef = useRef(true);

  const getBoundsCallback = useCallback(
    () => getBounds(boundaryRefOrSelector),
    [boundaryRefOrSelector],
  );

  useEffect(() => {
    isMountedRef.current = true;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mql.matches;

    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };

    mql.addEventListener("change", onChange);

    return () => {
      isMountedRef.current = false;
      mql.removeEventListener("change", onChange);
    };
  }, []);

  // Action loop (pick random behaviors: pause, reverse, keep moving)
  useEffect(() => {
    if (!enabled || reducedMotionRef.current) return;
    let timeoutId: number;

    const pickNextAction = () => {
      if (!isMountedRef.current) return;

      const st = stateRef.current;

      if (st.isPaused) {
        // We were paused, time to move
        st.isPaused = false;
        setIsPaused(false);

        // 25% chance to reverse direction
        if (Math.random() < 0.25) {
          st.direction = (st.direction * -1) as 1 | -1;
        }

        // Pick new speed (pixels per sec)
        st.speed = 30 + Math.random() * 50;

        // Move for 6-20 seconds
        const moveTime = 6000 + Math.random() * 14000;
        timeoutId = window.setTimeout(pickNextAction, moveTime);
      } else {
        // We were moving, time to pause
        st.isPaused = true;
        setIsPaused(true);

        // Pause for 0.8 to 2.5 seconds
        const pauseTime = 800 + Math.random() * 1700;
        timeoutId = window.setTimeout(pickNextAction, pauseTime);
      }
    };

    // Start by moving
    stateRef.current.isPaused = false;
    setIsPaused(false);
    timeoutId = window.setTimeout(pickNextAction, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [enabled]);

  // Boundary change detection
  useEffect(() => {
    if (!enabled) return;

    const updateRect = () => {
      stateRef.current.rect = getBoundsCallback();
    };

    updateRect();
    window.addEventListener("resize", updateRect);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      const el =
        typeof boundaryRefOrSelector === "string"
          ? document.querySelector(boundaryRefOrSelector)
          : boundaryRefOrSelector?.current || null;
      if (el) {
        ro = new ResizeObserver(updateRect);
        ro.observe(el);
      }
    }

    return () => {
      window.removeEventListener("resize", updateRect);
      if (ro) ro.disconnect();
    };
  }, [enabled, getBoundsCallback, boundaryRefOrSelector]);

  // Animation loop
  useEffect(() => {
    if (!enabled) return;

    let animationFrameId: number;

    const tick = (now: number) => {
      if (!isMountedRef.current) return;

      const st = stateRef.current;
      const dt = (now - st.lastTime) / 1000; // seconds
      st.lastTime = now;

      if (reducedMotionRef.current) {
        st.isPaused = true;
        setIsPaused(true);
        if (st.rect) {
          const { x, y, edge } = mapOffsetToPerimeterPoint(
            0,
            st.rect,
            ghostSize,
            padding,
            topPadding,
            false,
          );
          setPosition({ x, y });
          setEdge(edge);
        }
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      if (!st.isPaused && st.rect) {
        const rect = st.rect;

        // Initialize offset randomly on first tick
        if (st.offset === -1) {
          const { totalLen } = mapOffsetToPerimeterPoint(
            0,
            rect,
            ghostSize,
            padding,
            topPadding,
            avoidBottomCenter,
          );
          st.offset = Math.random() * totalLen;
        }

        const { x, y, edge, totalLen } = mapOffsetToPerimeterPoint(
          st.offset,
          rect,
          ghostSize,
          padding,
          topPadding,
          avoidBottomCenter,
        );

        st.offset = (st.offset + st.direction * st.speed * dt) % totalLen;

        setPosition((prev) => {
          if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) {
            return prev;
          }
          return { x, y };
        });
        setEdge(edge);
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    stateRef.current.lastTime = performance.now();
    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled, ghostSize, padding, topPadding, avoidBottomCenter]);

  return {
    x: position.x,
    y: position.y,
    edge,
    isMoving: !isPaused,
    isPaused,
    transitionDuration: 0, // Enforce 0 for JS continuous animation
  };
}
