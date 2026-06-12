export interface Step {
  id?: string;
  title?: string;
  instruction?: string;
  targetLabel?: string;
  x: number;
  y: number;
  action: "click" | "type" | "scroll" | "wait";
  typeText?: string;
  delayMs?: number;
  waitForMs?: number;
  narration?: string;
  viewportX?: number;
  viewportY?: number;
  coordinateFrame?: "viewport";
  sourceFrame?: "viewport" | "capture" | "practice-window" | "manual";
  rawTarget?: {
    x: number;
    y: number;
    coordinateFrame: "viewport" | "capture" | "practice-window" | "manual";
  };
  captureMeta?: {
    imageWidth: number;
    imageHeight: number;
    displayBounds: { x: number; y: number; width: number; height: number };
    captureBounds: { x: number; y: number; width: number; height: number };
    overlayBounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    coordinateMode: string;
  };
  axElementIndex?: string;
  axApp?: string;
  // Optional resolver hints consumed by replayAuto / replay target resolution.
  selector?: string;
  targetConfidence?: number;
  appName?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface Node {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  completed: boolean;
  attempts: number;
  avgStepTimeMs: number;
  lastStepIndex: number;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Branch {
  id: string;
  forkedFrom: {
    nodeId: string;
    stepIndex: number;
  };
  nodesCovered: string[];
  status: "active" | "completed";
}

export interface Session {
  id: string;
  timestamp: string;
  nodesVisited: string[];
  branchId?: string;
  steps: Step[];
}

export interface BanditState {
  A: [number, number]; // [alpha, beta]
  B: [number, number];
  C: [number, number];
}

export type SpecMood =
  | "idle"
  | "thinking"
  | "stuck"
  | "flow"
  | "celebrating"
  | "mirroring"
  | "judging";

export interface BehavioralState {
  cognitiveLoad: number;
  impulsivity: number;
  flowScore: number;
  revisionRate: number;
  backtrackRate: number;
  decisionConfidence: number;
  moodLabel: SpecMood;
  sampledAt: string;
}

export interface BehavioralFrame {
  t: number;
  cursorX?: number;
  cursorY?: number;
  cursorDelta?: { dx: number; dy: number };
  dwellMs: number;
  actionType:
    | "scan"
    | "click"
    | "repeat-click"
    | "type"
    | "pause"
    | "backtrack"
    | "app-switch"
    | "replay-retry"
    | "replay-failure"
    | "accept"
    | "override"
    | "hesitation"
    | "correction"
    | "unknown";
  revisionSignal: number;
  app?: string;
  targetLabel?: string;
  synthetic?: boolean;
}

export interface BehavioralCheckpoint {
  id: string;
  timestamp: string;
  sessionN: number;
  signature: BehavioralState;
  specPersonality: {
    defaultMood: SpecMood;
    eyeShape: "wide" | "focused" | "sleepy" | "judging" | "glow";
    bounce: number;
    sass: number;
  };
  parentId: string | null;
  label: string;
  commitMessage: string;
  synthetic?: boolean;
}

export interface BehavioralDiff {
  fromId: string;
  toId: string;
  deltas: {
    cognitiveLoad: number;
    impulsivity: number;
    flowScore: number;
    revisionRate: number;
    backtrackRate: number;
    decisionConfidence: number;
  };
  summary: string[];
}

export interface LearningGraph {
  userId: string;
  app: string;
  nodes: Record<string, Node>;
  edges: Edge[];
  branches: Record<string, Branch>;
  sessions: Session[];
  banditState: BanditState;
  behavioralCheckpoints?: Record<string, BehavioralCheckpoint>;
  currentBehavioralCheckpointId?: string | null;
  behavioralFrames?: BehavioralFrame[];
}
