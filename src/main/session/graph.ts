import { randomUUID } from "crypto";
import { LearningGraph, Node } from "./types";

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

export function markNodeComplete(
  graph: LearningGraph,
  nodeId: string,
): LearningGraph {
  const next = cloneGraph(graph);
  const currentNode = next.nodes[nodeId] || defaultNode(nodeId);

  next.nodes[nodeId] = {
    ...currentNode,
    completed: true,
    lastStepIndex: Math.max(currentNode.lastStepIndex, 0),
  };

  // Auto-complete branches that cover this node
  for (const branch of Object.values(next.branches)) {
    if (branch.status === "active" && branch.nodesCovered.includes(nodeId)) {
      branch.status = "completed";
    }
  }

  return next;
}

export function createBranch(
  graph: LearningGraph,
  fromNodeId: string,
  fromStep: number,
): { graph: LearningGraph; branchId: string } {
  const next = cloneGraph(graph);
  const branchId = randomUUID();

  const branch = {
    id: branchId,
    forkedFrom: { nodeId: fromNodeId, stepIndex: fromStep },
    nodesCovered: [fromNodeId],
    status: "active" as const,
  };

  next.branches[branchId] = branch;
  return { graph: next, branchId };
}

export function getAvailableNodes(graph: LearningGraph): Node[] {
  return Object.values(graph.nodes).filter((node) =>
    node.prerequisites.every(
      (prerequisite) => graph.nodes[prerequisite]?.completed,
    ),
  );
}

export function getNextRecommendedNode(graph: LearningGraph): Node | null {
  const candidates = getAvailableNodes(graph)
    .filter((node) => !node.completed)
    .sort((left, right) => {
      if (left.attempts !== right.attempts) {
        return left.attempts - right.attempts;
      }
      return left.title.localeCompare(right.title);
    });

  return candidates[0] || null;
}

export function getResumePrompt(graph: LearningGraph): string {
  const completed = Object.values(graph.nodes).filter((node) => node.completed);
  const inProgress = Object.values(graph.nodes).find(
    (node) => !node.completed && node.lastStepIndex > 0,
  );
  const lastSession =
    graph.sessions.length > 0
      ? graph.sessions[graph.sessions.length - 1]
      : null;

  if (!lastSession && completed.length === 0) {
    return "Welcome to Specter. Tell me what you want to learn first.";
  }

  if (inProgress) {
    return `Welcome back. You completed ${completed.length} ${
      completed.length === 1 ? "skill" : "skills"
    }. Resume ${inProgress.title} at step ${inProgress.lastStepIndex + 1}.`;
  }

  return `Welcome back. You completed ${completed.length} ${
    completed.length === 1 ? "skill" : "skills"
  }. Pick a new level when you are ready.`;
}
