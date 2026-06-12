import { EventEmitter } from "events";
import { buildTransitions, compileEhrWorkflow } from "./ehrWorkflow";
import {
  assertNotProhibited,
  ClinicalSafetyError,
  isProhibitedAutonomousAction,
  type ExecutionMode,
} from "./prohibitedActions";
import { clinicalError, clinicalLog, clinicalWarn } from "./logger";
import type {
  ActionTrace,
  EhrAction,
  EhrWorkflowState,
  WorkflowTransition,
} from "./types";

export interface EngineOptions {
  mode: ExecutionMode;
  abortOnBlocked?: boolean;
}

export interface EngineRunResult {
  trace: ActionTrace[];
  transitions: WorkflowTransition[];
  paused: EhrAction[];
  blocked: EhrAction[];
  finalState: EhrWorkflowState | null;
  errors: string[];
}

export class WorkflowEngine extends EventEmitter {
  private actions: EhrAction[];
  private currentIndex = 0;
  private state: EhrWorkflowState | null = null;
  private trace: ActionTrace[] = [];
  private transitions: WorkflowTransition[] = [];
  private paused: EhrAction[] = [];
  private blocked: EhrAction[] = [];

  constructor(actions: EhrAction[] = compileEhrWorkflow()) {
    super();
    this.actions = actions;
  }

  reset(): void {
    this.currentIndex = 0;
    this.state = null;
    this.trace = [];
    this.transitions = [];
    this.paused = [];
    this.blocked = [];
  }

  getActions(): EhrAction[] {
    return this.actions;
  }

  getState(): EhrWorkflowState | null {
    return this.state;
  }

  getTrace(): ActionTrace[] {
    return this.trace.slice();
  }

  getTransitions(): WorkflowTransition[] {
    return this.transitions.slice();
  }

  step(options: EngineOptions): boolean {
    if (this.currentIndex >= this.actions.length) return false;
    const a = this.actions[this.currentIndex];
    const ts = Date.now();

    let outcome: ActionTrace["outcome"];
    let notes: string | undefined;

    if (isProhibitedAutonomousAction(a)) {
      this.blocked.push(a);
      outcome = "blocked";
      notes = "Prohibited autonomous action — clinician signs manually.";
      try {
        assertNotProhibited(a, options.mode);
        clinicalWarn("prohibited action passed gate (mode permitted)", {
          id: a.id,
          mode: options.mode,
        });
      } catch (err) {
        if (err instanceof ClinicalSafetyError) {
          clinicalLog("safety gate refused autonomous action", { id: a.id });
        } else {
          clinicalError("unexpected error in safety gate", {
            id: a.id,
            err: String(err),
          });
        }
      }
      if (options.abortOnBlocked) {
        this.recordTrace(a, ts, outcome, notes);
        this.emit("blocked", a);
        return false;
      }
    } else if (a.safetyLevel === "clinician_confirmed") {
      this.paused.push(a);
      outcome = "paused_for_clinician";
      notes = "Awaiting explicit clinician confirmation.";
    } else if (a.action === "observe") {
      outcome = "observed";
    } else {
      outcome = "executed";
    }

    this.recordTrace(a, ts, outcome, notes);

    const transition = buildTransitions([a])[0];
    if (transition) {
      transition.from = this.state;
      this.transitions.push(transition);
      this.state = transition.to;
      this.emit("transition", transition);
    }

    if (outcome === "executed" || outcome === "observed") {
      this.emit("executed", a);
    } else if (outcome === "paused_for_clinician") {
      this.emit("paused", a);
    } else if (outcome === "blocked") {
      this.emit("blocked", a);
    }

    this.currentIndex++;
    return true;
  }

  run(options: EngineOptions): EngineRunResult {
    this.reset();
    const errors: string[] = [];
    while (this.currentIndex < this.actions.length) {
      try {
        const advanced = this.step(options);
        if (!advanced) break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        clinicalError("engine step failed", { msg });
        break;
      }
    }
    return {
      trace: this.getTrace(),
      transitions: this.getTransitions(),
      paused: this.paused.slice(),
      blocked: this.blocked.slice(),
      finalState: this.state,
      errors,
    };
  }

  private recordTrace(
    a: EhrAction,
    ts: number,
    outcome: ActionTrace["outcome"],
    notes?: string,
  ): void {
    this.trace.push({
      id: a.id,
      timestampMs: ts,
      action: a.action,
      semanticTarget: a.semanticTarget.label,
      screenRegion: a.semanticTarget.expectedRegion,
      preconditions: a.preconditions ?? [],
      postconditions: a.postconditions ?? [],
      safetyLevel: a.safetyLevel,
      replayAllowed: a.replayAllowed,
      outcome,
      notes,
    });
  }
}

export function dryRunWorkflow(): EngineRunResult {
  const engine = new WorkflowEngine();
  return engine.run({ mode: "dry_run", abortOnBlocked: false });
}
