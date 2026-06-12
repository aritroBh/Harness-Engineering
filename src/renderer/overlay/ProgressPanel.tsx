import React, { useState } from "react";
import {
  Steps,
  StepsItem,
  Card,
  CardHeader,
  Button,
  Tag,
  Separator,
} from "@openuidev/react-ui";
import { SessionPanel } from "./SessionPanel";
import { ChatThread } from "./ChatThread";
import { InputBar } from "./InputBar";
import { ModeToggle } from "./ModeToggle";
import type { UltraState } from "./UltraReplyBubble";
import type { SpecMood } from "../../main/session/types";

import type { StepRecord } from "./stepHistory";
export type { StepRecord };

type SpecterMode = "silent" | "ultra" | "ghostwiki";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProgressPanelProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  intent: string;
  appName?: string;
  specMood: SpecMood;
  replayState: "idle" | "running" | "paused";
  replayMode: "walkthrough" | "auto" | null;
  currentStep: {
    index?: number;
    total?: number;
    instruction?: string;
    targetLabel?: string;
    ghostLocked?: boolean;
  } | null;
  stepHistory: StepRecord[];
  stepProgress: number;
  isWalkthroughActive: boolean;
  isBusy: boolean;
  lastNodeId?: string;
  statusText?: string;
  manualConfirmMessage?: string;
  hasCompletedWalkthrough: boolean;
  mode: SpecterMode;
  ultraState: UltraState;
  ultraSessionHistory: ChatMessage[];
  lastTTSProvider?: string;
  showWorkflowCard: boolean;
  showMemoryPanel: boolean;
  showDebugTools: boolean;
  demoPresentationMode: boolean;
  workflowCard?: React.ReactNode;
  memoryPanel?: React.ReactNode;
  debugTools?: React.ReactNode;
  onWalkthrough: () => void;
  onAutoExecute: () => void;
  onReplay: () => void;
  onInputSubmit: (text: string) => void;
  onNewChat: () => void;
  onUltraSpokenInput: (text: string) => void;
  onRecordingStart: () => void;
  onTranscriptionStart: () => void;
  onTranscriptionEnd: () => void;
  onModeChange: (mode: SpecterMode) => void;
  onToggleMemory: () => void;
  onToggleDebug: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const MOOD_LABELS: Record<string, string> = {
  idle: "Ready",
  thinking: "Thinking",
  flow: "On track",
  judging: "Watching",
  celebrating: "Done",
  stuck: "Needs help",
  mirroring: "Mirroring",
};

function moodColor(mood: string): string {
  switch (mood) {
    case "flow":
    case "celebrating":
      return "#30d158";
    case "thinking":
    case "mirroring":
      return "#0a84ff";
    case "judging":
    case "stuck":
      return "#ff9f0a";
    default:
      return "rgba(255,255,255,0.35)";
  }
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  isExpanded,
  onToggleExpand,
  intent,
  appName,
  specMood,
  replayState,
  replayMode,
  currentStep,
  stepHistory,
  stepProgress,
  isWalkthroughActive,
  isBusy,
  lastNodeId,
  statusText,
  manualConfirmMessage,
  hasCompletedWalkthrough,
  mode,
  ultraState,
  ultraSessionHistory,
  lastTTSProvider,
  showWorkflowCard,
  showMemoryPanel,
  showDebugTools,
  demoPresentationMode,
  workflowCard,
  memoryPanel,
  debugTools,
  onWalkthrough,
  onAutoExecute,
  onReplay,
  onInputSubmit,
  onNewChat,
  onUltraSpokenInput,
  onRecordingStart,
  onTranscriptionStart,
  onTranscriptionEnd,
  onModeChange,
  onToggleMemory,
  onToggleDebug,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [showAllSteps, setShowAllSteps] = useState(false);
  const currentInstruction =
    currentStep?.instruction || currentStep?.targetLabel || statusText;
  const stepCount = currentStep?.total ?? stepHistory.length;
  const activeIndex = currentStep?.index ?? 0;
  const visibleSteps = showAllSteps ? stepHistory : stepHistory.slice(-4);
  const showSessionControls =
    lastNodeId && !showWorkflowCard && replayState === "idle";

  return (
    <aside
      className={`specter-progress-rail ${isExpanded ? "is-expanded" : "is-collapsed"}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label="Specter progress tracker"
    >
      <header className="specter-rail-header">
        <div className="specter-rail-brand">
          <span className="specter-rail-logo" aria-hidden="true">
            ◉
          </span>
          <div>
            <div className="specter-rail-title">Specter</div>
            <div className="specter-rail-subtitle">
              Powered by{" "}
              <a
                href="https://www.openui.com/"
                target="_blank"
                rel="noreferrer"
                className="specter-openui-link"
              >
                OpenUI
              </a>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="specter-rail-expand-btn"
          onClick={onToggleExpand}
          aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "◂" : "▸"}
        </button>
      </header>

      {isExpanded && (
        <div className="specter-rail-body">
          <section className="specter-rail-status">
            <div className="specter-rail-greeting">
              {intent ? "Working on your goal" : "How can I help?"}
            </div>
            <div className="specter-rail-status-row">
              <span
                className="specter-rail-status-dot"
                style={{ background: moodColor(specMood) }}
              />
              <span className="specter-rail-status-label">
                {MOOD_LABELS[specMood] || specMood}
              </span>
              {replayState === "running" && replayMode && (
                <Tag
                  className="specter-rail-mode-tag"
                  text={replayMode === "walkthrough" ? "Walkthrough" : "Auto"}
                  variant="info"
                  size="sm"
                />
              )}
            </div>
            {appName && <div className="specter-rail-app">{appName}</div>}
          </section>

          {intent && (
            <Card className="specter-rail-goal-card">
              <CardHeader title="Goal" subtitle={intent} />
            </Card>
          )}

          {(isWalkthroughActive || stepHistory.length > 0) && (
            <section className="specter-rail-steps">
              <div className="specter-rail-section-head">
                <span>Progress</span>
                {stepCount > 0 && (
                  <span className="specter-rail-step-count">
                    {activeIndex + 1} / {stepCount}
                  </span>
                )}
              </div>

              <div className="specter-rail-progress-track">
                <div
                  className="specter-rail-progress-fill"
                  style={{ width: `${Math.round(stepProgress * 100)}%` }}
                />
              </div>

              {currentInstruction && isWalkthroughActive && (
                <div className="specter-rail-current-step">
                  {currentInstruction}
                </div>
              )}

              {visibleSteps.length > 0 && (
                <div className="specter-rail-steps-list">
                  <Steps>
                    {visibleSteps.map((step) => (
                      <StepsItem
                        key={`${step.index}-${step.status}`}
                        number={step.index + 1}
                        title={
                          step.status === "current"
                            ? "Current step"
                            : step.status === "completed"
                              ? "Completed"
                              : step.status === "corrected"
                                ? "Corrected"
                                : "Upcoming"
                        }
                        details={step.instruction}
                      />
                    ))}
                  </Steps>
                </div>
              )}

              {stepHistory.length > 4 && (
                <button
                  type="button"
                  className="specter-rail-text-btn"
                  onClick={() => setShowAllSteps((v) => !v)}
                >
                  {showAllSteps
                    ? "Show fewer steps"
                    : `Show all ${stepHistory.length} steps`}
                </button>
              )}

              {hasCompletedWalkthrough && replayState === "idle" && (
                <Button className="specter-rail-replay-btn" onClick={onReplay}>
                  Replay walkthrough
                </Button>
              )}
            </section>
          )}

          {manualConfirmMessage && (
            <div className="specter-rail-confirm">{manualConfirmMessage}</div>
          )}

          {showWorkflowCard && workflowCard}

          {showSessionControls && (
            <SessionPanel
              intent={intent}
              nodeId={lastNodeId}
              appName={appName}
              isBusy={isBusy}
              isWalkthroughActive={isWalkthroughActive}
              stepProgress={stepProgress}
              onWalkthrough={onWalkthrough}
              onAutoExecute={onAutoExecute}
            />
          )}

          <Separator className="specter-rail-separator" />

          <section className="specter-rail-chat">
            <div className="specter-rail-section-head">
              <span>Conversation</span>
              <ModeToggle
                mode={mode}
                onChange={onModeChange}
                memoryOpen={showMemoryPanel}
                onToggleMemory={onToggleMemory}
              />
            </div>
            <ChatThread
              messages={ultraSessionHistory}
              state={ultraState}
              mode={mode}
              voiceFallback={lastTTSProvider === "macos"}
            />
            {!demoPresentationMode && (
              <InputBar
                onSubmit={onInputSubmit}
                onNewChat={onNewChat}
                disabled={isBusy}
                mode={mode}
                onUltraSpokenInput={onUltraSpokenInput}
                onRecordingStart={onRecordingStart}
                onTranscriptionStart={onTranscriptionStart}
                onTranscriptionEnd={onTranscriptionEnd}
              />
            )}
          </section>

          <div className="specter-rail-toolbar">
            <button
              type="button"
              className={`specter-rail-tool-btn ${showMemoryPanel ? "is-active" : ""}`}
              onClick={onToggleMemory}
            >
              Memory
            </button>
            <button
              type="button"
              className={`specter-rail-tool-btn ${showDebugTools ? "is-active" : ""}`}
              onClick={onToggleDebug}
            >
              Debug
            </button>
          </div>

          {showMemoryPanel && memoryPanel}
          {showDebugTools && debugTools}
        </div>
      )}
    </aside>
  );
};
