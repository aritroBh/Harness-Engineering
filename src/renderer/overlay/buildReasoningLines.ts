import type { UltraState } from "./UltraReplyBubble";
import type { ReasoningLine } from "./ReasoningBubbles";

interface BuildReasoningLinesInput {
  visible: boolean;
  screenApp?: string | null;
  screenWindowTitle?: string | null;
  screenSearchHint?: string | null;
  screenTyped?: string | null;
  isLoading: boolean;
  loadingMessage: string;
  agentStatusMessage: string;
  manualConfirmMessage: string;
  realAppNotice: string;
  ultraState: UltraState;
  replayRunning: boolean;
  currentStepInstruction?: string | null;
  mirrorRunning: boolean;
  contextReadActive: boolean;
  memorySearchActive: boolean;
}

const ULTRA_STATE_LABELS: Partial<Record<UltraState, string>> = {
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  guiding: "Guiding you…",
};

export function buildReasoningLines(
  input: BuildReasoningLinesInput,
): ReasoningLine[] {
  if (!input.visible) return [];

  const lines: ReasoningLine[] = [];

  if (input.manualConfirmMessage) {
    lines.push({ text: input.manualConfirmMessage, active: true });
  }

  if (input.replayRunning && input.currentStepInstruction) {
    lines.push({ text: input.currentStepInstruction, active: true });
  }

  if (input.mirrorRunning) {
    lines.push({ text: "Mirroring your clicks…", active: true });
  }

  if (input.isLoading && input.loadingMessage) {
    lines.push({ text: input.loadingMessage, active: true });
  }

  if (input.agentStatusMessage) {
    lines.push({ text: input.agentStatusMessage, active: true });
  }

  if (input.memorySearchActive) {
    lines.push({ text: "Searching GhostWiki memory…", active: true });
  }

  if (input.contextReadActive) {
    const app = input.screenApp || "your screen";
    lines.push({ text: `Reading ${app} context…`, active: true });
  }

  const ultraLabel = ULTRA_STATE_LABELS[input.ultraState];
  if (ultraLabel) {
    lines.push({ text: ultraLabel, active: true });
  }

  if (input.realAppNotice) {
    lines.push({ text: input.realAppNotice, active: false });
  }

  if (lines.length === 0 && input.screenApp) {
    const contextBits = [
      input.screenSearchHint
        ? `"${input.screenSearchHint}"`
        : input.screenTyped
          ? `typing "${input.screenTyped}"`
          : input.screenWindowTitle || null,
    ].filter(Boolean);
    const suffix = contextBits.length ? ` · ${contextBits[0]}` : "";
    lines.push({
      text: `Watching ${input.screenApp}${suffix}`,
      active: false,
    });
  }

  return lines.slice(-3);
}
