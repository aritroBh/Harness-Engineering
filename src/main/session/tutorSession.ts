/**
 * Tutor session driver (Part A / M2).
 *
 * Owns the live one-step-at-a-time loop the hackathon plan describes:
 *   session:start → planNextStep(tree) → cache ContractStep → emit spec:event
 * and exposes the current step for step:current polling.
 *
 * This is the brain-side glue between Person 1's serialized tree
 * (axEventWatcher) and Person 2's planner (planNextStep). It is intentionally
 * separate from the learning-graph session code in recorder.ts / storage.ts.
 *
 * M3 (verification) calls advanceStep()/correctStep(); M4 (memory) fills
 * profileSummary on start and the SessionSummary on goal_complete.
 */
import { planNextStep, summarizeSession } from "../ai/planner";
import { axEventWatcher } from "../context/axEventWatcher";
import { safeLog, safeWarn } from "../logger";
import {
  getProfile,
  profileSummary,
  setProfile,
} from "./skillProfileStore";
import {
  MOCK_TREE,
  type BrainEvent,
  type ContractStep,
  type SerializedTree,
  type SessionStartRequest,
  type SessionStartResponse,
} from "../../shared/partA-contract";

interface TutorSessionState {
  sessionId: string;
  goal: string;
  appHint?: string;
  /** key used for the per-app skill profile. */
  appKey: string;
  /** profile summary injected into every planNextStep call. */
  profileSummaryText: string;
  completed: ContractStep[];
  current: ContractStep | null;
  stepCounter: number;
  corrections: number;
}

let session: TutorSessionState | null = null;
let emit: (event: BrainEvent) => void = () => {};

/** Wire the brain → overlay push (set once at IPC registration). */
export function setBrainEventEmitter(fn: (event: BrainEvent) => void): void {
  emit = fn;
}

function makeSessionId(): string {
  return `s_${Date.now().toString(36)}`;
}

/** Latest live tree, or the canned tree so the demo never hard-stops. */
function currentTree(): SerializedTree {
  const live = axEventWatcher.getLatestTree();
  if (live) return live;
  safeWarn("[TUTOR] no live AX tree yet; using MOCK_TREE");
  return MOCK_TREE;
}

export async function startSession(
  req: SessionStartRequest,
): Promise<SessionStartResponse> {
  const goal =
    typeof req?.goal === "string" && req.goal.trim()
      ? req.goal.trim()
      : "get something done";
  const sessionId = makeSessionId();
  const appKey = req?.appHint?.trim() || "Specter";
  const prior = getProfile(appKey);
  session = {
    sessionId,
    goal,
    appHint: req?.appHint,
    appKey,
    profileSummaryText: profileSummary(appKey),
    completed: [],
    current: null,
    stepCounter: 0,
    corrections: 0,
  };
  safeLog("[TUTOR] session start", { sessionId, goal, appKey });

  // The "Welcome back!" memory moment when we have prior history for this app.
  const where = req?.appHint ? ` in ${req.appHint}` : "";
  const greeting =
    prior && prior.knows.length
      ? `Welcome back! You've already got ${prior.knows.join(" and ")} down, so let's focus on "${goal}".`
      : `Great — let's work on "${goal}"${where}. I'll guide you one step at a time.`;

  // Plan the first step without blocking the greeting; thinking → step_advanced
  // events drive the overlay.
  void planNext();

  return { sessionId, greeting };
}

/** Plan the next step, cache it, and emit the matching event. */
async function planNext(): Promise<void> {
  if (!session) return;
  emit({ type: "thinking" });

  const tree = currentTree();
  const stepId = ++session.stepCounter;
  const step = await planNextStep(
    session.goal,
    tree,
    session.completed,
    session.profileSummaryText,
    stepId,
  );
  session.current = step;

  if (step.goalComplete) {
    await finalizeGoal();
  } else {
    emit({ type: "step_advanced", step });
  }
}

/** Goal reached: summarize the run, update the skill profile, celebrate. */
async function finalizeGoal(): Promise<void> {
  if (!session) return;
  const prior = getProfile(session.appKey);
  const completedSays = session.completed.map((s) => s.say);
  const updated = await summarizeSession(
    session.goal,
    completedSays,
    session.corrections,
    prior,
  );
  setProfile(session.appKey, updated);
  safeLog("[TUTOR] goal complete; profile updated", { app: session.appKey });

  emit({
    type: "goal_complete",
    summary: {
      goal: session.goal,
      app: session.appKey,
      learned: updated.knows,
      corrections: session.corrections,
    },
  });
}

/** Latest cached step for step:current polling. */
export function getCurrentStep(): ContractStep | null {
  return session?.current ?? null;
}

/** Active goal, for the correction prompt in the verification loop. */
export function getCurrentGoal(): string {
  return session?.goal ?? "";
}

/**
 * M3 hook: user completed the current step correctly → bank it and plan next.
 */
export async function advanceStep(): Promise<void> {
  if (!session?.current) return;
  session.completed.push({ ...session.current, status: "completed" });
  await planNext();
}

/**
 * M3 hook: user clicked the wrong thing → surface a correction without
 * advancing. `message` comes from the cheap correction LLM call in M3.
 */
export function correctStep(message: string): void {
  if (!session?.current) return;
  session.corrections += 1;
  session.current = {
    ...session.current,
    status: "corrected",
    correction: message,
  };
  emit({ type: "step_corrected", step: session.current });
}

export function endSession(): void {
  session = null;
}
