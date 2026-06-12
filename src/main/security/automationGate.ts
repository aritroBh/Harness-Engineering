import { safeLog, safeWarn, safeError } from "../logger";

interface AutomationSession {
  token: string;
  mode: "auto" | "mirror" | "calibration" | "agent";
  createdAt: number;
  expiresAt: number;
  stepsAllowed: number;
  stepsConsumed: number;
  confirmed: boolean;
}

let currentSession: AutomationSession | null = null;

export function requestAutomationSession(
  mode: "auto" | "mirror" | "calibration" | "agent",
  steps: number = 500,
): string {
  const token = Math.random().toString(36).substring(2, 15);
  const now = Date.now();
  currentSession = {
    token,
    mode,
    createdAt: now,
    expiresAt: now + 30000, // 30 seconds to confirm
    stepsAllowed: steps,
    stepsConsumed: 0,
    confirmed: false,
  };
  safeLog("[AUTOMATION_GATE] Session requested", { mode, token });
  return token;
}

export function confirmAutomationSession(token: string): boolean {
  if (!currentSession || currentSession.token !== token) {
    safeWarn("[AUTOMATION_GATE] Confirm failed: invalid token");
    return false;
  }
  if (Date.now() > currentSession.expiresAt) {
    safeWarn("[AUTOMATION_GATE] Confirm failed: session expired");
    return false;
  }
  currentSession.confirmed = true;
  currentSession.expiresAt = Date.now() + 60000; // extend by 60s once confirmed
  safeLog("[AUTOMATION_GATE] Session confirmed", { token });
  return true;
}

export function validateAutomationAction(
  action: string,
  count: number = 1,
): boolean {
  if (!currentSession) {
    safeError(`[AUTOMATION_GATE] Blocked ${action}: no active session`);
    return false;
  }
  if (!currentSession.confirmed) {
    safeError(`[AUTOMATION_GATE] Blocked ${action}: session not confirmed`);
    return false;
  }
  if (Date.now() > currentSession.expiresAt) {
    safeError(`[AUTOMATION_GATE] Blocked ${action}: session expired`);
    currentSession = null;
    return false;
  }
  if (currentSession.stepsConsumed + count > currentSession.stepsAllowed) {
    safeError(`[AUTOMATION_GATE] Blocked ${action}: step limit exceeded`);
    return false;
  }
  currentSession.stepsConsumed += count;
  // Slide the inactivity window forward so a long, active walkthrough does not
  // expire mid-sequence; the step budget remains the hard cap on total actions.
  currentSession.expiresAt = Date.now() + 60000;
  safeLog(`[AUTOMATION_GATE] Allowed ${action}`, {
    consumed: currentSession.stepsConsumed,
    allowed: currentSession.stepsAllowed,
  });
  return true;
}

export function cancelAutomationSession(): void {
  safeLog("[AUTOMATION_GATE] Session cancelled");
  currentSession = null;
}
