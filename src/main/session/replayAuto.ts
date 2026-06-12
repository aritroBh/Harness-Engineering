import { safeLog, safeWarn } from "../logger";
import { clickRealMouse, executeRealMouseSteps } from "../cursor";
import {
  isPeekabooAvailable,
  clickTarget as peekabooClick,
  typeText,
  scrollTarget,
  pressHotkey,
} from "../automation/peekabooAdapter";
import type { Step } from "./types";
import { resolveTarget } from "../automation/targetResolver";
import {
  createReplayController,
  emitAgentAction,
  isActive,
  releaseReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForReplay,
  sleep,
} from "./replayController";
import { isProhibitedAutonomousLabel } from "../clinical/prohibitedActions";
import { refreshStepTarget } from "./stepRefresher";
import { toScreenPoint } from "../screenCoordinates";

const DEFAULT_WAIT_STEP_MS = 800;

// Clinical keyword gate built for the UCSF EHR vertical. On a general-purpose
// tutor it can silently skip steps whose labels happen to match clinical verbs
// (e.g. "Sign Note"). Enabled by default for safety; set
// CLINICAL_SAFETY_FILTER=false in .env to disable for non-clinical demos.
function clinicalSafetyFilterEnabled(): boolean {
  return process.env.CLINICAL_SAFETY_FILTER !== "false";
}

function clinicalSafetyHaystack(step: Step): string {
  return [
    step.id ?? "",
    step.title ?? "",
    step.targetLabel ?? "",
    step.instruction ?? "",
    step.typeText ?? "",
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ");
}

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS;
}

function stepTitle(step: Step): string {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}

function actionVerb(step: Step): string {
  const label = step.targetLabel ? `"${step.targetLabel}"` : "target";
  switch (step.action) {
    case "click":
      return `Clicking ${label}`;
    case "type":
      return `Typing ${step.typeText ? `"${String(step.typeText).slice(0, 40)}"` : "text"}${step.targetLabel ? ` into ${label}` : ""}`;
    case "scroll":
      return `Scrolling ${label}`;
    case "wait":
      return "Waiting for the screen to settle";
    default:
      return `Performing ${step.action} on ${label}`;
  }
}

export async function replayAutoExecute(steps: Step[]): Promise<void> {
  const controller = createReplayController();
  setOverlayForReplay();
  safeLog("[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION", {
    totalSteps: steps.length,
  });

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      // Re-ground the step against what is actually on screen *right now*
      // (live AX tree of the real app). Each executed action mutates the UI,
      // so a fresh dump per step — stored coordinates are only a fallback.
      const step = await refreshStepTarget(steps[index], { forceFresh: true });
      if (step.liveResolved) {
        emitAgentAction(`Found "${step.liveMatchedLabel}" on screen`, {
          detail: `match ${Math.round((step.liveConfidence ?? 0) * 100)}% · live coordinates`,
          status: "info",
          stepIndex: index,
        });
      }
      if (
        clinicalSafetyFilterEnabled() &&
        isProhibitedAutonomousLabel(clinicalSafetyHaystack(step))
      ) {
        safeWarn(
          "[AUTO_REAL_MOUSE] CLINICAL SAFETY: refusing to autonomously execute step matching prohibited action list. Use walkthrough mode for clinician confirmation.",
          {
            index,
            title: stepTitle(step),
            targetLabel: step.targetLabel,
          },
        );
        sendOverlay("replay:clinical-blocked", {
          index,
          step,
          reason: "prohibited autonomous action",
        });
        emitAgentAction(`Blocked: "${stepTitle(step)}" needs your confirmation`, {
          detail: "safety filter — autonomous execution refused",
          status: "warn",
          stepIndex: index,
        });
        break;
      }
      emitAgentAction(actionVerb(step), {
        status: "running",
        stepIndex: index,
      });
      safeLog("[AUTO_REAL_MOUSE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y,
      });

      if (step.action === "click") {
        if (!(await sleep(step.delayMs || 0, controller))) break;

        const pkAvailable = await isPeekabooAvailable();
        const resolved = resolveTarget(step, {
          hasDOM: false,
          peekabooAvailable: pkAvailable,
          peekabooTarget: pkAvailable
            ? { bbox: { x: step.x, y: step.y } }
            : undefined,
          vlmTarget: {
            confidence: step.targetConfidence ?? 0.8,
            bbox: { x: step.x, y: step.y, width: 0, height: 0 },
          },
          axTarget: (step as any).axTarget,
          currentApp: step.appName,
        });

        safeLog("[AUTO_REAL_MOUSE] resolved target", { index, resolved });

        if (resolved.requiresConfirmation) {
          safeWarn("[AUTO_REAL_MOUSE] Target requires confirmation. Pausing.", {
            index,
            resolved,
          });
          sendOverlay("replay:confirm-needed", {
            index,
            step,
            reason: "low confidence or unsafe target",
          });
          emitAgentAction(`Paused: not confident about "${stepTitle(step)}"`, {
            status: "warn",
            stepIndex: index,
          });
          break;
        }

        let success = false;

        if (resolved.source === "playwright") {
          safeLog("[AUTO_REAL_MOUSE] Executing Playwright click", {
            index,
            selector: resolved.selector,
          });
          success = true;
        } else if (resolved.source === "peekaboo") {
          let pkTarget: any;
          if (
            step.targetLabel ||
            step.selector ||
            (step as any).accessibilityId
          ) {
            pkTarget = {
              kind: "element",
              target:
                step.targetLabel ||
                step.selector ||
                (step as any).accessibilityId,
              snapshotId: (step as any).snapshotId,
            };
          } else if (typeof step.x === "number" && typeof step.y === "number") {
            // Peekaboo expects physical pixels; step.x/y are display percent.
            const px = await toScreenPoint(step.x, step.y);
            pkTarget = { kind: "coords", x: px.x, y: px.y };
          } else if (
            resolved.bbox &&
            typeof resolved.bbox.x === "number" &&
            typeof resolved.bbox.y === "number" &&
            typeof resolved.bbox.width === "number" &&
            typeof resolved.bbox.height === "number"
          ) {
            pkTarget = {
              kind: "coords",
              x: resolved.bbox.x + resolved.bbox.width / 2,
              y: resolved.bbox.y + resolved.bbox.height / 2,
            };
          } else if (
            step.bbox &&
            typeof step.bbox.x === "number" &&
            typeof step.bbox.y === "number" &&
            typeof step.bbox.width === "number" &&
            typeof step.bbox.height === "number"
          ) {
            pkTarget = {
              kind: "coords",
              x: step.bbox.x + step.bbox.width / 2,
              y: step.bbox.y + step.bbox.height / 2,
            };
          }

          if (!pkTarget) {
            safeWarn(
              "[AUTO_REAL_MOUSE] Peekaboo click missing target context. Pausing.",
              { index },
            );
            sendOverlay("replay:confirm-needed", {
              index,
              step,
              reason: "Peekaboo missing valid target",
            });
            break;
          }

          safeLog("[AUTO_REAL_MOUSE] Executing Peekaboo click", {
            index,
            target: pkTarget,
          });
          const result = await peekabooClick(pkTarget);
          if (!result.ok) {
            safeWarn(
              "[AUTO_REAL_MOUSE] Peekaboo click failed, attempting fallback",
              { result },
            );
            emitAgentAction("Element click failed — using system mouse", {
              status: "warn",
              stepIndex: index,
            });
            // Fallback AX -> vision -> real mouse
            const fallbackResolved = resolveTarget(step, {
              hasDOM: false,
              peekabooAvailable: false,
              vlmTarget: {
                confidence: step.targetConfidence ?? 0.8,
                bbox: { x: step.x, y: step.y, width: 0, height: 0 },
              },
              axTarget: (step as any).axTarget,
              currentApp: step.appName,
            });

            if (fallbackResolved.requiresConfirmation) {
              safeWarn(
                "[AUTO_REAL_MOUSE] Fallback target requires confirmation. Pausing.",
              );
              sendOverlay("replay:confirm-needed", {
                index,
                step,
                reason: "Peekaboo failed and fallback is low confidence",
              });
              break;
            }

            if (
              fallbackResolved.source === "openara" ||
              fallbackResolved.source === "ax"
            ) {
              if (fallbackResolved.bbox)
                await clickRealMouse(
                  fallbackResolved.bbox.x,
                  fallbackResolved.bbox.y,
                );
              success = true;
            } else {
              await clickRealMouse(step.x, step.y);
              success = true;
            }
          } else {
            success = true;
          }
        }

        if (
          !success &&
          (resolved.source === "openara" || resolved.source === "ax")
        ) {
          safeLog("[AUTO_REAL_MOUSE] Executing Accessibility click", {
            index,
            bbox: resolved.bbox,
          });
          if (resolved.bbox)
            await clickRealMouse(resolved.bbox.x, resolved.bbox.y);
        } else if (!success) {
          safeLog("[AUTO_REAL_MOUSE] REAL OS move/click (Vision/Fallback)", {
            index,
            x: step.x,
            y: step.y,
          });
          await clickRealMouse(step.x, step.y);
        }
      } else if (step.action === "wait") {
        const waitMs = stepWaitMs(step);
        safeLog("[AUTO_REAL_MOUSE] wait before next real OS action", {
          index,
          waitMs,
        });
        if (!(await sleep(waitMs, controller))) break;
      } else {
        if (!(await sleep(step.delayMs || 0, controller))) break;
        safeLog("[AUTO_REAL_MOUSE] REAL OS action replay", {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText),
        });

        const pkAvailable = await isPeekabooAvailable();
        let success = false;

        if (pkAvailable) {
          if (step.action === "type" && step.typeText) {
            const res = await typeText(step.typeText);
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo type failed", res);
          } else if (step.action === "scroll") {
            const res = await scrollTarget(step.targetLabel || "body", "down");
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo scroll failed", res);
          } else if ((step as any).action === "hotkey" && step.typeText) {
            const res = await pressHotkey(step.typeText);
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo hotkey failed", res);
          }
        }

        if (!success) {
          await executeRealMouseSteps([{ ...step, delayMs: 0 }]);
        }
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step complete", {
        index,
        action: step.action,
      });
      emitAgentAction(`Done: ${stepTitle(step)}`, {
        status: "done",
        stepIndex: index,
      });
      sendOverlay("replay:progress", { index, total: steps.length, step });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED", {
      cancelled: controller.cancelled,
    });
  }
}
