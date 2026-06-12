import { uIOhook, UiohookKey } from "uiohook-napi";
import type {
  BehavioralCheckpoint,
  BehavioralFrame,
  BehavioralState,
  LearningGraph,
} from "../session/types";
import { getMousePercent } from "../userCursor";
import {
  aggregateBehavioralSignature,
  createBehavioralCheckpoint,
  createDefaultBehavioralState,
  normalizeBehavioralFrame,
  normalizeBehavioralState,
} from "./model";
import { safeLog, safeWarn } from "../logger";
import { recordKeyEvent } from "../context/typedContextBuffer";

let foregroundAppProvider: (() => string | null) | null = null;

export function setForegroundAppProvider(
  provider: (() => string | null) | null,
): void {
  foregroundAppProvider = provider;
}

const MAX_MEMORY_FRAMES = 260;
const PAUSE_FRAME_INTERVAL_MS = 1000;
const HESITATION_THRESHOLD_MS = 1200;
const REPEATED_CLICK_WINDOW_MS = 1200;
const REPEATED_CLICK_RADIUS_PERCENT = 1.5;

let frames: BehavioralFrame[] = [];
let currentState: BehavioralState = createDefaultBehavioralState();
let isTracking = false;
let lastCursor: { x: number; y: number; t: number } | null = null;
let lastActionAt = Date.now();
let lastMouseFrameAt = 0;
let pauseTimer: NodeJS.Timeout | null = null;
let lastClick: { x?: number; y?: number; t: number; count: number } | null =
  null;
let cleanupListeners: Array<() => void> = [];
let stateEmitter:
  | ((state: BehavioralState, frame: BehavioralFrame) => void)
  | null = null;

function pushFrame(frame: BehavioralFrame): BehavioralFrame {
  const normalized = normalizeBehavioralFrame(frame);
  frames = [...frames, normalized].slice(-MAX_MEMORY_FRAMES);
  currentState = aggregateBehavioralSignature(frames, currentState);
  if (normalized.actionType !== "pause") {
    lastActionAt = normalized.t;
  }
  if (
    typeof normalized.cursorX === "number" &&
    typeof normalized.cursorY === "number"
  ) {
    lastCursor = {
      x: normalized.cursorX,
      y: normalized.cursorY,
      t: normalized.t,
    };
  }
  stateEmitter?.(currentState, normalized);
  return normalized;
}

function safeHook(eventName: string, handler: (event: any) => void): void {
  try {
    const hook = uIOhook as any;
    if (typeof hook.on !== "function") return;
    hook.on(eventName, handler);
    cleanupListeners.push(() => {
      try {
        if (typeof hook.off === "function") hook.off(eventName, handler);
        else if (typeof hook.removeListener === "function")
          hook.removeListener(eventName, handler);
      } catch (error) {
        safeWarn("[BEHAVIOR] failed to remove uiohook listener", {
          eventName,
          error,
        });
      }
    });
  } catch (error) {
    safeWarn(
      "[BEHAVIOR] uiohook listener unavailable; real behavior source disabled",
      { eventName, error },
    );
  }
}

function cursorPercentFromEvent(event: any): {
  x?: number;
  y?: number;
  delta?: { dx: number; dy: number };
} {
  const x =
    typeof event?.x === "number" && Number.isFinite(event.x)
      ? Math.min(100, Math.max(0, event.x))
      : undefined;
  const y =
    typeof event?.y === "number" && Number.isFinite(event.y)
      ? Math.min(100, Math.max(0, event.y))
      : undefined;
  const delta =
    typeof x === "number" && typeof y === "number" && lastCursor
      ? { dx: x - lastCursor.x, dy: y - lastCursor.y }
      : undefined;
  return { x, y, delta };
}

async function cursorPercentSafe(
  event: any,
): Promise<{ x?: number; y?: number; delta?: { dx: number; dy: number } }> {
  try {
    const position = await getMousePercent();
    return cursorPercentFromEvent(position);
  } catch {
    return cursorPercentFromEvent(event);
  }
}

function isBackspaceOrDelete(event: any): boolean {
  return (
    event?.keycode === UiohookKey.Backspace ||
    event?.keycode === UiohookKey.Delete
  );
}

function isRepeatedClick(cursor: { x?: number; y?: number }): boolean {
  const now = Date.now();
  if (!lastClick) {
    lastClick = { x: cursor.x, y: cursor.y, t: now, count: 1 };
    return false;
  }

  const distance =
    typeof cursor.x === "number" &&
    typeof cursor.y === "number" &&
    typeof lastClick.x === "number" &&
    typeof lastClick.y === "number"
      ? Math.hypot(cursor.x - lastClick.x, cursor.y - lastClick.y)
      : Number.POSITIVE_INFINITY;
  const repeated =
    now - lastClick.t <= REPEATED_CLICK_WINDOW_MS &&
    distance <= REPEATED_CLICK_RADIUS_PERCENT;
  lastClick = {
    x: cursor.x,
    y: cursor.y,
    t: now,
    count: repeated ? lastClick.count + 1 : 1,
  };
  return repeated;
}

function startPauseFrames(): void {
  if (pauseTimer) return;
  pauseTimer = setInterval(() => {
    if (!isTracking) return;
    const now = Date.now();
    const dwellMs = now - lastActionAt;
    if (dwellMs < HESITATION_THRESHOLD_MS) return;
    pushFrame({
      t: now,
      cursorX: lastCursor?.x,
      cursorY: lastCursor?.y,
      dwellMs,
      actionType: "pause",
      revisionSignal: 0,
      targetLabel: "hesitation before action",
    });
  }, PAUSE_FRAME_INTERVAL_MS);
}

function stopPauseFrames(): void {
  if (!pauseTimer) return;
  clearInterval(pauseTimer);
  pauseTimer = null;
}

function realFramesFrom(graph: LearningGraph): BehavioralFrame[] {
  return (
    Array.isArray(graph.behavioralFrames) ? graph.behavioralFrames : []
  ).filter((frame) => frame.synthetic !== true);
}

export function setBehavioralStateEmitter(
  emitter: ((state: BehavioralState, frame: BehavioralFrame) => void) | null,
): void {
  stateEmitter = emitter;
}

export function getBufferedBehavioralFrameCount(): number {
  return frames.filter((frame) => frame.synthetic !== true).length;
}

export function getRecentActivityHints(limit = 12): Array<{
  actionType: string;
  t: number;
  app?: string;
}> {
  return frames.slice(-limit).map((frame) => ({
    actionType: frame.actionType,
    t: frame.t,
    app: frame.app,
  }));
}

export function getTypingBurstCount(windowMs = 60_000): number {
  const cutoff = Date.now() - windowMs;
  return frames.filter(
    (frame) => frame.t >= cutoff && frame.actionType === "type",
  ).length;
}

export function getBehavioralFrameRate(): {
  realFrames: number;
  trackingMs: number;
} {
  return {
    realFrames: frames.filter(
      (frame) => frame.synthetic !== true && frame.actionType !== "pause",
    ).length,
    trackingMs: isTracking ? Date.now() - (frames[0]?.t ?? Date.now()) : 0,
  };
}

export function startBehavioralTracking(): void {
  if (isTracking) return;
  isTracking = true;
  safeLog("[BEHAVIOR] tracking start");

  safeHook("click", (event) => {
    void cursorPercentSafe(event).then((cursor) => {
      pushFrame({
        t: Date.now(),
        cursorX: cursor.x,
        cursorY: cursor.y,
        cursorDelta: cursor.delta,
        dwellMs: Math.max(0, Date.now() - lastActionAt),
        actionType: isRepeatedClick(cursor) ? "repeat-click" : "click",
        revisionSignal: 0,
      });
    });
  });

  safeHook("keydown", (event) => {
    recordKeyEvent(event);
    const revision = isBackspaceOrDelete(event) ? 1 : 0;
    const appLabel = foregroundAppProvider?.() || undefined;
    pushFrame({
      t: Date.now(),
      dwellMs: Math.max(0, Date.now() - lastActionAt),
      actionType: revision ? "backtrack" : "type",
      revisionSignal: revision,
      app: appLabel,
    });
  });

  safeHook("mousemove", (event) => {
    const now = Date.now();
    if (now - lastMouseFrameAt < 180) return;
    lastMouseFrameAt = now;
    void cursorPercentSafe(event).then((cursor) => {
      pushFrame({
        t: Date.now(),
        cursorX: cursor.x,
        cursorY: cursor.y,
        cursorDelta: cursor.delta,
        dwellMs: Math.max(0, Date.now() - lastActionAt),
        actionType: "scan",
        revisionSignal: 0,
      });
    });
  });

  startPauseFrames();
}

export function stopBehavioralTracking(): void {
  if (!isTracking) return;
  isTracking = false;
  stopPauseFrames();
  for (const cleanup of cleanupListeners) cleanup();
  cleanupListeners = [];
  safeLog("[BEHAVIOR] tracking stop");
}

export function getCurrentBehavioralState(): BehavioralState {
  currentState = aggregateBehavioralSignature(frames, currentState);
  return currentState;
}

export function recordBehavioralFrame(frame: any): BehavioralFrame {
  return pushFrame(normalizeBehavioralFrame(frame));
}

export function recordBehavioralReward(input: any): BehavioralFrame {
  const reward =
    typeof input?.reward === "number" && Number.isFinite(input.reward)
      ? Math.min(1, Math.max(0, input.reward))
      : 0.5;
  return pushFrame({
    t: Date.now(),
    dwellMs: 350,
    actionType:
      reward >= 0.7 ? "accept" : reward <= 0.25 ? "override" : "hesitation",
    revisionSignal: reward <= 0.25 ? 0.8 : 0.05,
    targetLabel:
      typeof input?.targetLabel === "string"
        ? input.targetLabel
        : "reward signal",
  });
}

export function rewardFromFeedback(input: any): number {
  const kind = typeof input?.kind === "string" ? input.kind : "hesitation";
  const correctionCount =
    typeof input?.correctionCount === "number" &&
    Number.isFinite(input.correctionCount)
      ? Math.max(0, Math.round(input.correctionCount))
      : 0;

  if (kind === "accept") return 1;
  if (kind === "override") return 0;
  if (kind === "correction") return Math.max(0, 0.2 - correctionCount * 0.08);
  return 0.35;
}

export function recordBehavioralFeedback(input: any): {
  frame: BehavioralFrame;
  reward: number;
} {
  const reward = rewardFromFeedback(input);
  const kind = typeof input?.kind === "string" ? input.kind : "hesitation";
  const actionType: BehavioralFrame["actionType"] =
    kind === "accept"
      ? "accept"
      : kind === "override"
        ? "override"
        : kind === "correction"
          ? "correction"
          : "hesitation";

  const frame = pushFrame({
    t: Date.now(),
    dwellMs:
      typeof input?.hesitationMs === "number" &&
      Number.isFinite(input.hesitationMs)
        ? Math.max(0, Math.round(input.hesitationMs))
        : 350,
    actionType,
    revisionSignal:
      actionType === "accept" ? 0 : actionType === "hesitation" ? 0.3 : 1,
    targetLabel:
      typeof input?.targetLabel === "string" && input.targetLabel.trim()
        ? input.targetLabel.trim()
        : `Mirror Mode ${actionType} feedback`,
  });

  return { frame, reward };
}

export function recordAppSwitchFrame(label: string): BehavioralFrame {
  return pushFrame({
    t: Date.now(),
    dwellMs: Math.max(0, Date.now() - lastActionAt),
    actionType: "app-switch",
    revisionSignal: 0,
    app: label,
    targetLabel: "window/app switching",
  });
}

export function recordReplayBehavioralEvent(
  kind: "retry" | "failure",
  targetLabel?: string,
): BehavioralFrame {
  return pushFrame({
    t: Date.now(),
    dwellMs: Math.max(0, Date.now() - lastActionAt),
    actionType: kind === "retry" ? "replay-retry" : "replay-failure",
    revisionSignal: kind === "retry" ? 0.45 : 0.85,
    targetLabel: targetLabel || `replay ${kind}`,
  });
}

export function createCheckpointFromCurrentGraph(graph: LearningGraph): {
  graph: LearningGraph;
  checkpoint: BehavioralCheckpoint;
} {
  const storedFrames = realFramesFrom(graph);
  const realFrames = [
    ...storedFrames,
    ...frames.filter((frame) => frame.synthetic !== true),
  ];
  if (realFrames.length === 0) {
    throw new Error(
      "Create Checkpoint needs measured behavioral frames first. Use the computer normally for a bit, then try again.",
    );
  }

  const signature = aggregateBehavioralSignature(
    realFrames,
    getCurrentBehavioralState(),
  );
  const checkpoints = graph.behavioralCheckpoints || {};
  const parentId =
    typeof graph.currentBehavioralCheckpointId === "string" &&
    checkpoints[graph.currentBehavioralCheckpointId] &&
    checkpoints[graph.currentBehavioralCheckpointId].synthetic !== true
      ? graph.currentBehavioralCheckpointId
      : null;
  const parent = parentId ? checkpoints[parentId] : null;
  const checkpoint = createBehavioralCheckpoint({
    sessionN: Math.max(1, graph.sessions.length + 1),
    signature,
    previous: parent,
    parentId,
    label: `Session ${Math.max(1, graph.sessions.length + 1)}: ${signature.moodLabel} you`,
  });
  const nextGraph: LearningGraph = {
    ...graph,
    behavioralCheckpoints: {
      ...checkpoints,
      [checkpoint.id]: checkpoint,
    },
    currentBehavioralCheckpointId: checkpoint.id,
    behavioralFrames: realFrames.slice(-500),
  };

  currentState = signature;
  safeLog("[BEHAVIOR] checkpoint created", {
    id: checkpoint.id,
    label: checkpoint.label,
  });
  return { graph: nextGraph, checkpoint };
}

export function seedDemoCheckpoints(graph: LearningGraph): {
  graph: LearningGraph;
  checkpoints: BehavioralCheckpoint[];
} {
  const existing = graph.behavioralCheckpoints || {};
  const baseTimestamp = Date.now();
  const demoStates: Array<{
    label: string;
    commitMessage: string;
    signature: BehavioralState;
  }> = [
    {
      label: "DEV FALLBACK: synthetic cautious signature",
      commitMessage: "synthetic demo data: cautious interaction signature",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.82,
        impulsivity: 0.18,
        flowScore: 0.32,
        revisionRate: 0.62,
        backtrackRate: 0.38,
        decisionConfidence: 0.36,
        moodLabel: "thinking",
        sampledAt: new Date(baseTimestamp - 180000).toISOString(),
      }),
    },
    {
      label: "DEV FALLBACK: synthetic flow signature",
      commitMessage:
        "synthetic demo data: reduced hesitation, increased cursor confidence",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.28,
        impulsivity: 0.58,
        flowScore: 0.88,
        revisionRate: 0.16,
        backtrackRate: 0.08,
        decisionConfidence: 0.86,
        moodLabel: "flow",
        sampledAt: new Date(baseTimestamp - 90000).toISOString(),
      }),
    },
    {
      label: "DEV FALLBACK: synthetic mirror signature",
      commitMessage: "synthetic demo data: persona-conditioned mirror preview",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.56,
        impulsivity: 0.86,
        flowScore: 0.72,
        revisionRate: 0.24,
        backtrackRate: 0.12,
        decisionConfidence: 0.74,
        moodLabel: "mirroring",
        sampledAt: new Date(baseTimestamp).toISOString(),
      }),
    },
  ];

  let parentId: string | null = graph.currentBehavioralCheckpointId || null;
  const checkpoints = demoStates.map((entry, index) => {
    const checkpoint = createBehavioralCheckpoint({
      id: `demo-behavior-${index + 1}`,
      timestamp: entry.signature.sampledAt,
      sessionN: index + 1,
      signature: entry.signature,
      previous: parentId ? existing[parentId] : null,
      parentId,
      label: entry.label,
      commitMessage: entry.commitMessage,
      synthetic: true,
    });
    parentId = checkpoint.id;
    return checkpoint;
  });
  const nextCheckpoints = {
    ...existing,
    ...Object.fromEntries(
      checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
    ),
  };
  const nextGraph: LearningGraph = {
    ...graph,
    behavioralCheckpoints: nextCheckpoints,
    currentBehavioralCheckpointId:
      checkpoints[checkpoints.length - 1]?.id ||
      graph.currentBehavioralCheckpointId ||
      null,
    behavioralFrames: graph.behavioralFrames || [],
  };

  currentState = checkpoints[checkpoints.length - 1]?.signature || currentState;
  safeLog("[BEHAVIOR] demo checkpoints seeded", {
    count: checkpoints.length,
    current: nextGraph.currentBehavioralCheckpointId,
  });
  return { graph: nextGraph, checkpoints };
}
