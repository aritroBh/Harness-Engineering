import { randomUUID } from "crypto";
import { LearningGraph, Step, Node } from "./types";

let activeRecording: Step[] | null = null;

function cloneGraph(graph: LearningGraph): LearningGraph {
  return {
    ...graph,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([id, node]) => [
        id,
        { ...node, prerequisites: [...node.prerequisites] },
      ]),
    ),
    edges: graph.edges.map((edge) => ({ ...edge })),
    branches: Object.fromEntries(
      Object.entries(graph.branches).map(([id, branch]) => [
        id,
        {
          ...branch,
          forkedFrom: { ...branch.forkedFrom },
          nodesCovered: [...branch.nodesCovered],
        },
      ]),
    ),
    sessions: graph.sessions.map((session) => ({
      ...session,
      nodesVisited: [...session.nodesVisited],
      steps: session.steps.map((step) => ({ ...step })),
    })),
    banditState: {
      A: [...graph.banditState.A],
      B: [...graph.banditState.B],
      C: [...graph.banditState.C],
    },
  };
}

function defaultNode(nodeId: string): Node {
  return {
    id: nodeId,
    title: nodeId.replace(/[-_]/g, " "),
    description: "",
    prerequisites: [],
    completed: false,
    attempts: 0,
    avgStepTimeMs: 0,
    lastStepIndex: 0,
  };
}

function averageStepTime(steps: Step[]): number {
  const timings = steps
    .map((s) => s.delayMs)
    .filter((d): d is number => typeof d === "number" && d > 0);
  if (timings.length === 0) return 0;
  return timings.reduce((a, b) => a + b, 0) / timings.length;
}

function normalizeRecordedStep(step: any): Step {
  const sourceFrames = ["viewport", "capture", "practice-window", "manual"];
  const sourceFrame =
    typeof step.sourceFrame === "string" &&
    sourceFrames.includes(step.sourceFrame)
      ? step.sourceFrame
      : undefined;
  const rawTarget =
    step.rawTarget && typeof step.rawTarget === "object"
      ? step.rawTarget
      : null;

  return {
    id: typeof step.id === "string" ? step.id : undefined,
    title: typeof step.title === "string" ? step.title : undefined,
    instruction:
      typeof step.instruction === "string" ? step.instruction : undefined,
    targetLabel:
      typeof step.targetLabel === "string" ? step.targetLabel : undefined,
    x: Number.isFinite(step.x) ? Math.min(100, Math.max(0, step.x)) : 50,
    y: Number.isFinite(step.y) ? Math.min(100, Math.max(0, step.y)) : 50,
    action: ["click", "type", "scroll", "wait"].includes(step.action)
      ? step.action
      : "click",
    typeText: typeof step.typeText === "string" ? step.typeText : undefined,
    delayMs: Number.isFinite(step.delayMs)
      ? Math.max(0, Math.round(step.delayMs))
      : 0,
    waitForMs: Number.isFinite(step.waitForMs)
      ? Math.max(0, Math.round(step.waitForMs))
      : undefined,
    narration: typeof step.narration === "string" ? step.narration : undefined,
    viewportX: Number.isFinite(step.viewportX)
      ? Math.min(100, Math.max(0, step.viewportX))
      : undefined,
    viewportY: Number.isFinite(step.viewportY)
      ? Math.min(100, Math.max(0, step.viewportY))
      : undefined,
    coordinateFrame:
      step.coordinateFrame === "viewport" ? "viewport" : undefined,
    sourceFrame: sourceFrame as Step["sourceFrame"],
    rawTarget: rawTarget
      ? {
          x: Number.isFinite(rawTarget.x)
            ? Math.min(100, Math.max(0, rawTarget.x))
            : 50,
          y: Number.isFinite(rawTarget.y)
            ? Math.min(100, Math.max(0, rawTarget.y))
            : 50,
          coordinateFrame:
            typeof rawTarget.coordinateFrame === "string" &&
            sourceFrames.includes(rawTarget.coordinateFrame)
              ? rawTarget.coordinateFrame
              : "capture",
        }
      : undefined,
    captureMeta:
      step.captureMeta && typeof step.captureMeta === "object"
        ? step.captureMeta
        : undefined,
  };
}

export function startRecording(): void {
  activeRecording = [];
}

export function recordStep(step: any): void {
  if (!activeRecording) activeRecording = [];
  activeRecording.push(normalizeRecordedStep(step));
}

export function stopRecording(): Step[] {
  const steps = activeRecording ? [...activeRecording] : [];
  activeRecording = null;
  return steps;
}

export function saveToNode(
  graph: LearningGraph,
  nodeId: string,
  steps: Step[],
): LearningGraph {
  const next = cloneGraph(graph);
  const currentNode = next.nodes[nodeId] || defaultNode(nodeId);
  const normalizedSteps = steps.map(normalizeRecordedStep);
  const avgStepTimeMs = averageStepTime(normalizedSteps);

  const activeBranch = Object.values(next.branches).find(
    (b) => b.status === "active",
  );
  if (activeBranch && !activeBranch.nodesCovered.includes(nodeId)) {
    activeBranch.nodesCovered.push(nodeId);
  }

  next.nodes[nodeId] = {
    ...currentNode,
    attempts: currentNode.attempts + 1,
    avgStepTimeMs:
      currentNode.attempts === 0
        ? avgStepTimeMs
        : (currentNode.avgStepTimeMs * currentNode.attempts + avgStepTimeMs) /
          (currentNode.attempts + 1),
    lastStepIndex: Math.max(0, normalizedSteps.length - 1),
  };

  next.sessions.push({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    nodesVisited: [nodeId],
    branchId: activeBranch?.id,
    steps: normalizedSteps,
  });

  return next;
}
