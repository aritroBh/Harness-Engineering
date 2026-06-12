import type {
  BehavioralCheckpoint,
  BehavioralDiff,
  BehavioralFrame,
  BehavioralState,
  SpecMood,
} from "../session/types";

const MOODS: SpecMood[] = [
  "idle",
  "thinking",
  "stuck",
  "flow",
  "celebrating",
  "mirroring",
  "judging",
];
const ACTIONS: BehavioralFrame["actionType"][] = [
  "scan",
  "click",
  "repeat-click",
  "type",
  "pause",
  "backtrack",
  "app-switch",
  "replay-retry",
  "replay-failure",
  "accept",
  "override",
  "hesitation",
  "correction",
  "unknown",
];
const METRIC_KEYS: Array<keyof BehavioralDiff["deltas"]> = [
  "cognitiveLoad",
  "impulsivity",
  "flowScore",
  "revisionRate",
  "backtrackRate",
  "decisionConfidence",
];

function isRecord(value: any): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMood(value: any): value is SpecMood {
  return typeof value === "string" && MOODS.includes(value as SpecMood);
}

function isoString(value: any, fallback = new Date().toISOString()): string {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function safeLabel(value: any, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function percent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function metricLabel(key: keyof BehavioralDiff["deltas"]): string {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

export function clamp01(value: any, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function createDefaultBehavioralState(): BehavioralState {
  return {
    cognitiveLoad: 0.24,
    impulsivity: 0.22,
    flowScore: 0.36,
    revisionRate: 0.08,
    backtrackRate: 0.04,
    decisionConfidence: 0.48,
    moodLabel: "idle",
    sampledAt: new Date().toISOString(),
  };
}

export function deriveSpecMood(state: Partial<BehavioralState>): SpecMood {
  if (isMood(state.moodLabel) && state.moodLabel === "celebrating")
    return "celebrating";
  if (isMood(state.moodLabel) && state.moodLabel === "mirroring")
    return "mirroring";

  const cognitiveLoad = clamp01(state.cognitiveLoad, 0.24);
  const impulsivity = clamp01(state.impulsivity, 0.22);
  const flowScore = clamp01(state.flowScore, 0.36);
  const revisionRate = clamp01(state.revisionRate, 0.08);
  const backtrackRate = clamp01(state.backtrackRate, 0.04);
  const decisionConfidence = clamp01(state.decisionConfidence, 0.48);

  if (flowScore >= 0.72 && decisionConfidence >= 0.58 && backtrackRate < 0.25)
    return "flow";
  if (cognitiveLoad >= 0.78 || backtrackRate >= 0.55) return "stuck";
  if (
    revisionRate >= 0.48 ||
    (impulsivity >= 0.74 && decisionConfidence < 0.48)
  )
    return "judging";
  if (cognitiveLoad >= 0.5 || decisionConfidence < 0.38) return "thinking";
  return "idle";
}

export function normalizeBehavioralState(value: any): BehavioralState {
  const fallback = createDefaultBehavioralState();
  const raw = isRecord(value) ? value : {};
  const partial = {
    cognitiveLoad: clamp01(raw.cognitiveLoad, fallback.cognitiveLoad),
    impulsivity: clamp01(raw.impulsivity, fallback.impulsivity),
    flowScore: clamp01(raw.flowScore, fallback.flowScore),
    revisionRate: clamp01(raw.revisionRate, fallback.revisionRate),
    backtrackRate: clamp01(raw.backtrackRate, fallback.backtrackRate),
    decisionConfidence: clamp01(
      raw.decisionConfidence,
      fallback.decisionConfidence,
    ),
  };

  return {
    ...partial,
    moodLabel: isMood(raw.moodLabel) ? raw.moodLabel : deriveSpecMood(partial),
    sampledAt: isoString(raw.sampledAt, fallback.sampledAt),
  };
}

export function normalizeBehavioralFrame(value: any): BehavioralFrame {
  const raw = isRecord(value) ? value : {};
  const actionType: BehavioralFrame["actionType"] =
    typeof raw.actionType === "string" &&
    ACTIONS.includes(raw.actionType as BehavioralFrame["actionType"])
      ? (raw.actionType as BehavioralFrame["actionType"])
      : "unknown";
  const cursorDelta = isRecord(raw.cursorDelta)
    ? {
        dx:
          typeof raw.cursorDelta.dx === "number" &&
          Number.isFinite(raw.cursorDelta.dx)
            ? raw.cursorDelta.dx
            : 0,
        dy:
          typeof raw.cursorDelta.dy === "number" &&
          Number.isFinite(raw.cursorDelta.dy)
            ? raw.cursorDelta.dy
            : 0,
      }
    : undefined;

  return {
    t:
      typeof raw.t === "number" && Number.isFinite(raw.t)
        ? Math.max(0, raw.t)
        : Date.now(),
    cursorX:
      typeof raw.cursorX === "number" && Number.isFinite(raw.cursorX)
        ? Math.min(100, Math.max(0, raw.cursorX))
        : undefined,
    cursorY:
      typeof raw.cursorY === "number" && Number.isFinite(raw.cursorY)
        ? Math.min(100, Math.max(0, raw.cursorY))
        : undefined,
    cursorDelta,
    dwellMs:
      typeof raw.dwellMs === "number" && Number.isFinite(raw.dwellMs)
        ? Math.max(0, raw.dwellMs)
        : 0,
    actionType,
    revisionSignal: clamp01(raw.revisionSignal, 0),
    app:
      typeof raw.app === "string" && raw.app.trim()
        ? raw.app.trim()
        : undefined,
    targetLabel:
      typeof raw.targetLabel === "string" && raw.targetLabel.trim()
        ? raw.targetLabel.trim()
        : undefined,
    synthetic: raw.synthetic === true,
  };
}

export function aggregateBehavioralSignature(
  frames: BehavioralFrame[],
  fallback: BehavioralState = createDefaultBehavioralState(),
): BehavioralState {
  const normalized = Array.isArray(frames)
    ? frames.map(normalizeBehavioralFrame).slice(-160)
    : [];
  if (normalized.length === 0) return normalizeBehavioralState(fallback);

  const totals = normalized.reduce(
    (acc, frame, index) => {
      const previous = normalized[index - 1];
      const dwellNorm = clamp01(frame.dwellMs / 2200, 0);
      const deltaDistance = frame.cursorDelta
        ? Math.hypot(frame.cursorDelta.dx, frame.cursorDelta.dy)
        : previous &&
            typeof frame.cursorX === "number" &&
            typeof frame.cursorY === "number"
          ? Math.hypot(
              frame.cursorX - (previous.cursorX ?? frame.cursorX),
              frame.cursorY - (previous.cursorY ?? frame.cursorY),
            )
          : 0;
      const directness = clamp01(
        deltaDistance / (deltaDistance + frame.dwellMs / 140 + 1),
        0.45,
      );
      const actionWeight =
        frame.actionType === "click" ||
        frame.actionType === "type" ||
        frame.actionType === "accept"
          ? 1
          : frame.actionType === "repeat-click" ||
              frame.actionType === "override" ||
              frame.actionType === "correction"
            ? 0.78
            : frame.actionType === "scan"
              ? 0.24
              : 0.12;
      const pauseWeight = frame.actionType === "pause" ? 1 : 0;
      const backtrackWeight =
        frame.actionType === "backtrack" ||
        frame.actionType === "replay-retry" ||
        frame.actionType === "replay-failure" ||
        frame.actionType === "override" ||
        frame.actionType === "correction"
          ? 1
          : 0;
      const hesitationWeight = frame.actionType === "hesitation" ? 1 : 0;
      const revision = clamp01(frame.revisionSignal, 0);
      const confidence = clamp01(
        directness * 0.72 +
          (1 - dwellNorm) * 0.28 -
          revision * 0.25 -
          backtrackWeight * 0.3 -
          hesitationWeight * 0.18,
        0.3,
      );
      const cognitiveLoad = clamp01(
        dwellNorm * 0.45 +
          revision * 0.32 +
          pauseWeight * 0.18 +
          backtrackWeight * 0.24 +
          hesitationWeight * 0.2,
        0,
      );
      const impulsivity = clamp01(
        actionWeight * (1 - dwellNorm) * (0.55 + directness * 0.45),
        0,
      );

      acc.cognitiveLoad += cognitiveLoad;
      acc.impulsivity += impulsivity;
      acc.revisionRate += revision;
      acc.backtrackRate += backtrackWeight;
      acc.decisionConfidence += confidence;
      acc.pauseRate += pauseWeight;
      return acc;
    },
    {
      cognitiveLoad: 0,
      impulsivity: 0,
      revisionRate: 0,
      backtrackRate: 0,
      decisionConfidence: 0,
      pauseRate: 0,
    },
  );

  const count = normalized.length;
  const decisionConfidence = clamp01(
    totals.decisionConfidence / count,
    fallback.decisionConfidence,
  );
  const backtrackRate = clamp01(
    totals.backtrackRate / count,
    fallback.backtrackRate,
  );
  const revisionRate = clamp01(
    totals.revisionRate / count,
    fallback.revisionRate,
  );
  const pauseRate = clamp01(totals.pauseRate / count, 0);
  const impulsivity = clamp01(totals.impulsivity / count, fallback.impulsivity);
  const cognitiveLoad = clamp01(
    totals.cognitiveLoad / count,
    fallback.cognitiveLoad,
  );
  const flowScore = clamp01(
    decisionConfidence * 0.58 +
      (1 - backtrackRate) * 0.2 +
      (1 - revisionRate) * 0.12 +
      (1 - pauseRate) * 0.1,
    fallback.flowScore,
  );
  const state = {
    cognitiveLoad,
    impulsivity,
    flowScore,
    revisionRate,
    backtrackRate,
    decisionConfidence,
  };

  return {
    ...state,
    moodLabel: deriveSpecMood(state),
    sampledAt: new Date().toISOString(),
  };
}

export function personalityForState(
  state: BehavioralState,
): BehavioralCheckpoint["specPersonality"] {
  const normalized = normalizeBehavioralState(state);
  const mood = deriveSpecMood(normalized);
  const eyeShape: BehavioralCheckpoint["specPersonality"]["eyeShape"] =
    mood === "mirroring"
      ? "glow"
      : mood === "judging"
        ? "judging"
        : mood === "stuck"
          ? "sleepy"
          : mood === "flow" || mood === "celebrating"
            ? "wide"
            : "focused";

  return {
    defaultMood: mood,
    eyeShape,
    bounce: clamp01(
      0.24 +
        normalized.flowScore * 0.48 +
        normalized.impulsivity * 0.22 -
        normalized.cognitiveLoad * 0.14,
      0.35,
    ),
    sass: clamp01(
      0.16 +
        normalized.impulsivity * 0.34 +
        normalized.revisionRate * 0.28 +
        normalized.backtrackRate * 0.16,
      0.24,
    ),
  };
}

export function humanCommitMessage(
  previous: BehavioralState | null | undefined,
  next: BehavioralState,
): string {
  const normalizedNext = normalizeBehavioralState(next);
  if (!previous) {
    return `commit: initialized behavioral checkpoint at ${Math.round(normalizedNext.decisionConfidence * 100)}% confidence`;
  }

  const normalizedPrevious = normalizeBehavioralState(previous);
  const deltas = METRIC_KEYS.map((key) => ({
    key,
    delta: normalizedNext[key] - normalizedPrevious[key],
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const [primary, secondary] = deltas;
  const secondaryText = secondary
    ? `, ${metricLabel(secondary.key)} ${percent(secondary.delta)}`
    : "";

  return `commit: ${metricLabel(primary.key)} ${percent(primary.delta)}${secondaryText}`;
}

export function createBehavioralCheckpoint(args: {
  id?: string;
  timestamp?: string;
  sessionN: number;
  signature: BehavioralState;
  previous?: BehavioralCheckpoint | BehavioralState | null;
  parentId?: string | null;
  label?: string;
  commitMessage?: string;
  synthetic?: boolean;
}): BehavioralCheckpoint {
  const timestamp = isoString(args.timestamp);
  const sessionN = Math.max(1, Math.round(args.sessionN || 1));
  const signature = normalizeBehavioralState(args.signature);
  const previousSignature =
    args.previous && "signature" in args.previous
      ? args.previous.signature
      : args.previous;
  const id = safeLabel(
    args.id,
    `behavior-${sessionN}-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`,
  );

  return {
    id,
    timestamp,
    sessionN,
    signature,
    specPersonality: personalityForState(signature),
    parentId: typeof args.parentId === "string" ? args.parentId : null,
    label: safeLabel(
      args.label,
      `Session ${sessionN}: ${signature.moodLabel} you`,
    ),
    commitMessage: safeLabel(
      args.commitMessage,
      humanCommitMessage(previousSignature, signature),
    ),
    synthetic: args.synthetic === true,
  };
}

export function normalizeBehavioralCheckpoint(
  value: any,
  fallbackId?: string,
): BehavioralCheckpoint {
  const raw = isRecord(value) ? value : {};
  const signature = normalizeBehavioralState(raw.signature);
  const timestamp = isoString(raw.timestamp, signature.sampledAt);
  const sessionN =
    typeof raw.sessionN === "number" && Number.isFinite(raw.sessionN)
      ? Math.max(1, Math.round(raw.sessionN))
      : 1;
  const checkpoint = createBehavioralCheckpoint({
    id: safeLabel(raw.id, fallbackId || `behavior-${sessionN}`),
    timestamp,
    sessionN,
    signature,
    parentId: typeof raw.parentId === "string" ? raw.parentId : null,
    label: safeLabel(
      raw.label,
      `Session ${sessionN}: ${signature.moodLabel} you`,
    ),
    commitMessage: safeLabel(
      raw.commitMessage,
      humanCommitMessage(null, signature),
    ),
    synthetic: raw.synthetic === true,
  });

  return {
    ...checkpoint,
    synthetic: raw.synthetic === true,
    specPersonality: isRecord(raw.specPersonality)
      ? {
          defaultMood: isMood(raw.specPersonality.defaultMood)
            ? raw.specPersonality.defaultMood
            : checkpoint.specPersonality.defaultMood,
          eyeShape: ["wide", "focused", "sleepy", "judging", "glow"].includes(
            raw.specPersonality.eyeShape,
          )
            ? raw.specPersonality.eyeShape
            : checkpoint.specPersonality.eyeShape,
          bounce: clamp01(
            raw.specPersonality.bounce,
            checkpoint.specPersonality.bounce,
          ),
          sass: clamp01(
            raw.specPersonality.sass,
            checkpoint.specPersonality.sass,
          ),
        }
      : checkpoint.specPersonality,
  };
}

export function diffBehavioralCheckpoints(
  from: BehavioralCheckpoint,
  to: BehavioralCheckpoint,
): BehavioralDiff {
  const normalizedFrom = normalizeBehavioralCheckpoint(from);
  const normalizedTo = normalizeBehavioralCheckpoint(to);
  const deltas = {
    cognitiveLoad:
      normalizedTo.signature.cognitiveLoad -
      normalizedFrom.signature.cognitiveLoad,
    impulsivity:
      normalizedTo.signature.impulsivity - normalizedFrom.signature.impulsivity,
    flowScore:
      normalizedTo.signature.flowScore - normalizedFrom.signature.flowScore,
    revisionRate:
      normalizedTo.signature.revisionRate -
      normalizedFrom.signature.revisionRate,
    backtrackRate:
      normalizedTo.signature.backtrackRate -
      normalizedFrom.signature.backtrackRate,
    decisionConfidence:
      normalizedTo.signature.decisionConfidence -
      normalizedFrom.signature.decisionConfidence,
  };
  const summary = METRIC_KEYS.map((key) => ({ key, delta: deltas[key] }))
    .filter((entry) => Math.abs(entry.delta) >= 0.03)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4)
    .map((entry) => `${metricLabel(entry.key)} ${percent(entry.delta)}`);

  if (summary.length === 0) {
    summary.push("behavioral signature stayed stable");
  }

  return {
    fromId: normalizedFrom.id,
    toId: normalizedTo.id,
    deltas,
    summary,
  };
}

export function blendBehavioralStates(
  a: BehavioralState,
  b: BehavioralState,
  t: number,
): BehavioralState {
  const from = normalizeBehavioralState(a);
  const to = normalizeBehavioralState(b);
  const amount = clamp01(t, 0);
  if (amount <= 0) return from;
  if (amount >= 1) return to;

  const blended = {
    cognitiveLoad:
      from.cognitiveLoad + (to.cognitiveLoad - from.cognitiveLoad) * amount,
    impulsivity:
      from.impulsivity + (to.impulsivity - from.impulsivity) * amount,
    flowScore: from.flowScore + (to.flowScore - from.flowScore) * amount,
    revisionRate:
      from.revisionRate + (to.revisionRate - from.revisionRate) * amount,
    backtrackRate:
      from.backtrackRate + (to.backtrackRate - from.backtrackRate) * amount,
    decisionConfidence:
      from.decisionConfidence +
      (to.decisionConfidence - from.decisionConfidence) * amount,
  };

  return {
    ...blended,
    moodLabel: deriveSpecMood(blended),
    sampledAt: new Date().toISOString(),
  };
}
