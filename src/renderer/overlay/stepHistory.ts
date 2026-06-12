export interface StepRecord {
  index: number;
  instruction: string;
  status: "completed" | "current" | "upcoming" | "corrected";
  timestamp?: number;
}

export interface StepHistoryInput {
  total: number;
  currentIndex: number;
  instructions: Map<number, string>;
  correctedIndices?: Set<number>;
  completedIndices?: Set<number>;
  sessionComplete?: boolean;
}

export function buildStepHistory(input: StepHistoryInput): StepRecord[] {
  const {
    total,
    currentIndex,
    instructions,
    correctedIndices = new Set(),
    completedIndices = new Set(),
    sessionComplete = false,
  } = input;

  if (total <= 0) return [];

  const effectiveCurrent = sessionComplete ? total : currentIndex;

  return Array.from({ length: total }, (_, index) => {
    const instruction = instructions.get(index) || `Step ${index + 1}`;
    let status: StepRecord["status"] = "upcoming";

    if (correctedIndices.has(index)) {
      status = "corrected";
    } else if (
      sessionComplete ||
      completedIndices.has(index) ||
      index < effectiveCurrent
    ) {
      status = "completed";
    } else if (index === effectiveCurrent && !sessionComplete) {
      status = "current";
    }

    return { index, instruction, status };
  });
}

export function upsertStepInstruction(
  map: Map<number, string>,
  index: number,
  instruction: string,
): Map<number, string> {
  const next = new Map(map);
  if (instruction.trim()) {
    next.set(index, instruction.trim());
  }
  return next;
}

export function markCompletedUpTo(
  completed: Set<number>,
  index: number,
): Set<number> {
  const next = new Set(completed);
  for (let i = 0; i < index; i += 1) {
    next.add(i);
  }
  return next;
}

export function computeStepProgress(
  total: number,
  currentIndex: number,
  completedIndices: Set<number>,
  sessionComplete: boolean,
  ghostLocked = false,
): number {
  if (total <= 0) return 0;
  if (sessionComplete) return 1;

  let completed = 0;
  for (let i = 0; i < total; i += 1) {
    if (completedIndices.has(i) || i < currentIndex) completed += 1;
  }

  const currentPartial = ghostLocked ? 1 : 0.35;
  const numerator = Math.min(total, completed + currentPartial);
  return Math.min(1, numerator / total);
}

export function stepSummary(steps: StepRecord[]) {
  return steps.reduce(
    (acc, step) => {
      acc[step.status] += 1;
      return acc;
    },
    { completed: 0, current: 0, upcoming: 0, corrected: 0 },
  );
}
