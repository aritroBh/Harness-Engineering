/**
 * Part A (Brain) ↔ Group B (Overlay) interface contract.
 *
 * This is the Hour-0 lock. Both people on Part A and Group B build against these
 * types. See docs/CONTRACT.md for the IPC channels that carry them and
 * docs/PART_A_PLAN.md for who owns what.
 *
 * Specter already has src/main/session/types.ts (Step, etc.). This file does NOT
 * replace it — it defines the *boundary* types that cross the brain↔overlay seam
 * and the brain-internal Perception↔Cognition seam, with the fields Specter is
 * currently missing (stable element id, goal_complete, correction, status).
 */

/** ────────────────────────────────────────────────────────────────────────
 *  Coordinate convention (decide once, save hours):
 *  The brain ALWAYS returns physical screen pixels + a scale factor.
 *  The overlay divides by `screenScale` to get CSS px. Test on the demo machine.
 *  ──────────────────────────────────────────────────────────────────────── */

/** A single interactive element in the serialized tree. */
export interface ContractElement {
  /** Stable short id, e.g. "e17". Survives across dumps (hash of role+title+path). */
  id: string;
  role: string; // "button" | "textfield" | "link" | ...
  label: string; // human label / title
  value?: string;
  /** [x1, y1, x2, y2] in PHYSICAL screen pixels. */
  bbox: [number, number, number, number];
  focused?: boolean;
}

/** The Perception → Cognition handoff (Person 1 produces, Person 2 consumes). */
export interface SerializedTree {
  app: string; // "Gmail (browser: Chrome)"
  window: string; // "Inbox — user@gmail.com"
  screenScale: number; // retina scale factor, e.g. 2.0
  focusedId: string | null;
  elements: ContractElement[]; // ≤ ~300, truncate with count if more
  truncatedCount?: number; // how many were dropped, if any
  /** Pre-rendered compact text the planner eats. Optional convenience. */
  compactText?: string;
}

export type ActionType = "click" | "type" | "scroll" | "wait" | "read";

export type StepStatus = "active" | "completed" | "corrected" | "goal_done";

/** What the planner emits and the overlay renders + speaks. */
export interface ContractStep {
  stepId: number;
  /** Tutor narration: ≤2 sentences, explains *why* not just *what*. */
  say: string;
  /** Resolved from element_id → bbox via the live tree. null if no target (e.g. read/wait). */
  target: {
    elementId: string;
    role: string;
    label: string;
    bbox: [number, number, number, number]; // physical px
    screenScale: number;
  } | null;
  actionType: ActionType;
  status: StepStatus;
  /** Set when status === "corrected": one friendly line. Otherwise null. */
  correction: string | null;
  goalComplete: boolean;
}

/** The raw JSON the LLM is asked to return (before bbox resolution). */
export interface PlannerOutput {
  say: string;
  element_id: string | null;
  action_type: ActionType;
  goal_complete: boolean;
}

/** Per-app learned profile injected into the planner prompt. */
export interface SkillProfile {
  proficiency: "beginner" | "beginner+" | "intermediate" | "advanced";
  knows: string[]; // ["compose", "send"]
  struggledWith: string[]; // ["attachments"]
  notes?: string;
}

export interface ProfilePayload {
  apps: Record<string, SkillProfile>;
}

/** session:start request/response. */
export interface SessionStartRequest {
  goal: string; // "send an email with an attachment"
  appHint?: string; // "Gmail"
}
export interface SessionStartResponse {
  sessionId: string;
  /** Greeting with the memory callback line, e.g. "Welcome back! ...". */
  greeting: string;
}

/** Permission status for B's onboarding (permissions:get). */
export interface PermissionStatus {
  accessibility: "granted" | "denied" | "not-determined";
  screen?: "granted" | "denied" | "not-determined";
}

/** WebSocket/IPC push events: brain → overlay. */
export type BrainEvent =
  | { type: "thinking" } // planner running; overlay pulses
  | { type: "step_advanced"; step: ContractStep } // user did it right
  | { type: "step_corrected"; step: ContractStep } // wrong click; show correction
  | { type: "goal_complete"; summary: SessionSummary }; // celebration

export interface SessionSummary {
  goal: string;
  app: string;
  learned: string[]; // ["composing", "attachments"]
  corrections: number;
}

/** Canned response for Group B to build against before the brain is live. */
export const MOCK_STEP: ContractStep = {
  stepId: 4,
  say: "Click the paperclip icon at the bottom of your draft to attach a file.",
  target: {
    elementId: "e17",
    role: "button",
    label: "Attach files",
    bbox: [612, 884, 648, 920],
    screenScale: 2.0,
  },
  actionType: "click",
  status: "active",
  correction: null,
  goalComplete: false,
};

/**
 * Canned serialized tree for Group B / driver fallback when the live AX tree
 * isn't available yet (e.g. Accessibility not granted, no foreground app read).
 */
export const MOCK_TREE: SerializedTree = {
  app: "Gmail (browser: Chrome)",
  window: "Inbox — user@gmail.com",
  screenScale: 2.0,
  focusedId: "e42",
  elements: [
    { id: "e3", role: "button", label: "Compose", bbox: [88, 120, 160, 150] },
    {
      id: "e17",
      role: "button",
      label: "Attach files",
      bbox: [612, 884, 648, 920],
    },
    {
      id: "e42",
      role: "textfield",
      label: "Search mail",
      value: "",
      bbox: [400, 60, 700, 90],
      focused: true,
    },
  ],
};
