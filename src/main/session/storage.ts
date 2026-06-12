import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { LearningGraph, Node, Edge, Branch, Step, Session } from "./types";
import { createDefaultBanditState, normalizeBanditState } from "../ai/bandit";
import {
  normalizeBehavioralCheckpoint,
  normalizeBehavioralFrame,
} from "../behavioral/model";
import { safeError } from "../logger";

const DEFAULT_APP_NAME = "Specter";
const STEP_ACTIONS = ["click", "type", "scroll", "wait"];
const SOURCE_FRAMES = ["viewport", "capture", "practice-window", "manual"];

export function createDefaultGraph(appName = DEFAULT_APP_NAME): LearningGraph {
  return {
    userId: process.env.SPECTER_USER_ID || "local-user",
    app: appName,
    nodes: {},
    edges: [],
    branches: {},
    sessions: [],
    banditState: createDefaultBanditState(),
    behavioralCheckpoints: {},
    currentBehavioralCheckpointId: null,
    behavioralFrames: [],
  };
}

function graphPath(appName: string): string {
  const safeName = appName.replace(/[^a-z0-9._-]/gi, "_");
  return join(
    homedir(),
    "Library",
    "Application Support",
    "Specter",
    `${safeName}.json`,
  );
}

function isRecord(value: any): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: any, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nonNegativeNumber(value: any, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function percentNumber(value: any, fallback = 50): number {
  return Math.min(100, nonNegativeNumber(value, fallback));
}

function nonNegativeInteger(value: any, fallback = 0): number {
  return Math.round(nonNegativeNumber(value, fallback));
}

function stringArray(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function normalizeAction(value: any): Step["action"] {
  return typeof value === "string" && STEP_ACTIONS.includes(value)
    ? (value as Step["action"])
    : "click";
}

function normalizeSourceFrame(value: any): Step["sourceFrame"] {
  return typeof value === "string" && SOURCE_FRAMES.includes(value)
    ? (value as Step["sourceFrame"])
    : undefined;
}

function normalizeNode(nodeId: string, value: any): Node {
  const node = isRecord(value) ? value : {};
  return {
    id: stringValue(node.id, nodeId),
    title: stringValue(node.title, nodeId.replace(/[-_]/g, " ")),
    description: typeof node.description === "string" ? node.description : "",
    prerequisites: stringArray(node.prerequisites),
    completed: Boolean(node.completed),
    attempts: nonNegativeInteger(node.attempts),
    avgStepTimeMs: nonNegativeNumber(node.avgStepTimeMs),
    lastStepIndex: nonNegativeInteger(node.lastStepIndex),
  };
}

function normalizeEdge(value: any): Edge | null {
  if (
    !isRecord(value) ||
    typeof value.from !== "string" ||
    typeof value.to !== "string"
  ) {
    return null;
  }
  return { from: value.from, to: value.to };
}

function normalizeBranch(branchId: string, value: any): Branch {
  const branch = isRecord(value) ? value : {};
  const forkedFrom = isRecord(branch.forkedFrom) ? branch.forkedFrom : {};
  const status = branch.status === "completed" ? "completed" : "active";

  return {
    id: stringValue(branch.id, branchId),
    forkedFrom: {
      nodeId: stringValue(forkedFrom.nodeId, ""),
      stepIndex: nonNegativeInteger(forkedFrom.stepIndex),
    },
    nodesCovered: stringArray(branch.nodesCovered),
    status,
  };
}

function normalizeStep(value: any): Step {
  const step = isRecord(value) ? value : {};
  const rawTarget = isRecord(step.rawTarget) ? step.rawTarget : null;
  const captureMeta = isRecord(step.captureMeta) ? step.captureMeta : undefined;
  return {
    id: typeof step.id === "string" ? step.id : undefined,
    title: typeof step.title === "string" ? step.title : undefined,
    instruction:
      typeof step.instruction === "string" ? step.instruction : undefined,
    targetLabel:
      typeof step.targetLabel === "string" ? step.targetLabel : undefined,
    x: percentNumber(step.x ?? step.targetX),
    y: percentNumber(step.y ?? step.targetY),
    action: normalizeAction(step.action),
    typeText: typeof step.typeText === "string" ? step.typeText : undefined,
    delayMs: nonNegativeInteger(step.delayMs),
    waitForMs: nonNegativeInteger(step.waitForMs),
    narration: typeof step.narration === "string" ? step.narration : undefined,
    viewportX:
      typeof step.viewportX === "number"
        ? percentNumber(step.viewportX)
        : undefined,
    viewportY:
      typeof step.viewportY === "number"
        ? percentNumber(step.viewportY)
        : undefined,
    coordinateFrame:
      step.coordinateFrame === "viewport" ? "viewport" : undefined,
    sourceFrame: normalizeSourceFrame(step.sourceFrame),
    rawTarget: rawTarget
      ? {
          x: percentNumber(rawTarget.x),
          y: percentNumber(rawTarget.y),
          coordinateFrame:
            normalizeSourceFrame(rawTarget.coordinateFrame) || "capture",
        }
      : undefined,
    captureMeta: captureMeta as Step["captureMeta"],
  };
}

function normalizeSession(sessionId: string, value: any): Session {
  const session = isRecord(value) ? value : {};
  return {
    id: stringValue(session.id, sessionId),
    timestamp: stringValue(session.timestamp, new Date().toISOString()),
    nodesVisited: stringArray(session.nodesVisited),
    branchId:
      typeof session.branchId === "string" ? session.branchId : undefined,
    steps: Array.isArray(session.steps) ? session.steps.map(normalizeStep) : [],
  };
}

function legacyBanditStateKey(): string {
  return ["band", "tState"].join("");
}

function persistedBanditState(source: any): any {
  return "banditState" in source
    ? source.banditState
    : source[legacyBanditStateKey()];
}

export function normalizeGraph(graph: any, appName: string): LearningGraph {
  const fallback = createDefaultGraph(appName);
  const source = isRecord(graph) ? graph : {};

  const nodes = isRecord(source.nodes)
    ? Object.fromEntries(
        Object.entries(source.nodes).map(([id, node]) => [
          id,
          normalizeNode(id, node),
        ]),
      )
    : fallback.nodes;

  const branches = isRecord(source.branches)
    ? Object.fromEntries(
        Object.entries(source.branches).map(([id, branch]) => [
          id,
          normalizeBranch(id, branch),
        ]),
      )
    : fallback.branches;

  const edges = Array.isArray(source.edges)
    ? (source.edges
        .map(normalizeEdge)
        .filter((edge) => Boolean(edge)) as Edge[])
    : fallback.edges;

  const sessions = Array.isArray(source.sessions)
    ? source.sessions.map((session: any, index: number) =>
        normalizeSession(`session-${index + 1}`, session),
      )
    : fallback.sessions;

  const behavioralCheckpoints = isRecord(source.behavioralCheckpoints)
    ? Object.fromEntries(
        Object.entries(source.behavioralCheckpoints).map(([id, checkpoint]) => [
          id,
          normalizeBehavioralCheckpoint(checkpoint, id),
        ]),
      )
    : fallback.behavioralCheckpoints;

  const currentBehavioralCheckpointId =
    typeof source.currentBehavioralCheckpointId === "string" &&
    behavioralCheckpoints &&
    source.currentBehavioralCheckpointId in behavioralCheckpoints
      ? source.currentBehavioralCheckpointId
      : null;

  const behavioralFrames = Array.isArray(source.behavioralFrames)
    ? source.behavioralFrames.map(normalizeBehavioralFrame).slice(-500)
    : fallback.behavioralFrames;

  const normalized = {
    ...fallback,
    ...source,
    userId:
      typeof source.userId === "string" && source.userId.trim()
        ? source.userId
        : fallback.userId,
    app:
      typeof source.app === "string" && source.app.trim()
        ? source.app
        : appName,
    nodes,
    edges,
    branches,
    sessions,
    banditState: normalizeBanditState(persistedBanditState(source)),
    behavioralCheckpoints,
    currentBehavioralCheckpointId,
    behavioralFrames,
  };

  delete (normalized as Record<string, unknown>)[legacyBanditStateKey()];
  return normalized;
}

import { getDemoWorkflow } from "./demoWorkflow";

export function loadGraph(appName = DEFAULT_APP_NAME): LearningGraph {
  const specterMode = process.env.SPECTER_MODE || "ghostwiki";
  if (specterMode === "ghostwiki") {
    const demo = getDemoWorkflow();
    if (demo) {
      return normalizeGraph(demo as any, appName);
    }
  }

  const filePath = graphPath(appName);
  if (!existsSync(filePath)) {
    return createDefaultGraph(appName);
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return normalizeGraph(parsed, appName);
  } catch (error) {
    safeError("[Specter] Failed to load learning graph:", error);
    return createDefaultGraph(appName);
  }
}

export function saveGraph(graph: LearningGraph): void {
  const filePath = graphPath(graph.app || DEFAULT_APP_NAME);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify(normalizeGraph(graph, graph.app), null, 2) + "\n",
    "utf8",
  );
}
