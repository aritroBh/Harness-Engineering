import type { EhrAction, SafetyLevel } from "./types";

export const PROHIBITED_AUTONOMOUS_ACTIONS = [
  "SIGN_NOTE",
  "SIGN_ORDER",
  "FINAL_SUBMIT_MEDICATION_ORDER",
  "BYPASS_CLINICAL_ADVISORY_WITHOUT_USER_CONFIRMATION",
  "SIGN_ATTESTATION",
  "SUBMIT_TEACHING_PHYSICIAN_CONFIRMATION",
  "AUTOTYPE_INTO_APEX",
  "SEND_PHI_TO_COMMERCIAL_LLM",
] as const;

export type ProhibitedAction = (typeof PROHIBITED_AUTONOMOUS_ACTIONS)[number];

export type ExecutionMode = "autonomous" | "clinician_confirmed" | "dry_run";

export class ClinicalSafetyError extends Error {
  public readonly action: string;
  public readonly reason: string;
  constructor(action: string, reason: string) {
    super(`[CLINICAL_SAFETY] Refused autonomous ${action}: ${reason}`);
    this.name = "ClinicalSafetyError";
    this.action = action;
    this.reason = reason;
    Object.setPrototypeOf(this, ClinicalSafetyError.prototype);
  }
}

const PROHIBITED_PATTERNS: RegExp[] = [
  /\bsign[_\s-]*note\b/i,
  /\bsign[_\s-]*order/i,
  /\bfinal[_\s-]*submit/i,
  /\bbypass[_\s-]*advisory/i,
  /\bmanual_sign_only\b/i,
  /\bsign[_\s-]*attest(?:ation)?\b/i,
  /\bteaching[_\s-]*physician[_\s-]*(?:submit|sign|confirm)\b/i,
  /\bauto[_\s-]?type[_\s-]?into[_\s-]?apex\b/i,
  /\bphi[_\s-]?to[_\s-]?(?:commercial|anthropic|openai)\b/i,
];

export function isProhibitedAutonomousLabel(label: string): boolean {
  if (!label) return false;
  const upper = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (PROHIBITED_AUTONOMOUS_ACTIONS.some((p) => upper.includes(p))) return true;
  return PROHIBITED_PATTERNS.some((rx) => rx.test(label));
}

export function isProhibitedAutonomousAction(action: EhrAction): boolean {
  if (action.safetyLevel === "prohibited") return true;
  if (action.action === "manual_sign_only") return true;
  const haystack = `${action.id} ${action.semanticTarget.label} ${action.reason}`;
  return isProhibitedAutonomousLabel(haystack);
}

export function assertNotProhibited(
  action: EhrAction,
  mode: ExecutionMode,
): void {
  if (mode !== "autonomous") return;
  if (isProhibitedAutonomousAction(action)) {
    throw new ClinicalSafetyError(
      action.id,
      "must require explicit clinician confirmation",
    );
  }
}

export function safetyLevelForLabel(label: string): SafetyLevel {
  if (isProhibitedAutonomousLabel(label)) return "prohibited";
  if (/\b(advisory|reason|confirm|accept[_\s-]*order)\b/i.test(label)) {
    return "clinician_confirmed";
  }
  return "read_only";
}
