import React, { useMemo } from "react";
import { Steps, StepsItem, Tag, Button } from "@openuidev/react-ui";
import { CuteGhostSvg } from "./CuteGhostSvg";
import type { StepRecord } from "./stepHistory";
import { stepSummary } from "./stepHistory";

export interface AgentActionEvent {
  id: string;
  ts: number;
  label: string;
  detail?: string;
  status: "running" | "done" | "info" | "warn";
  stepIndex?: number;
}

export interface ProgressTrackerProps {
  expanded: boolean;
  onToggleExpand: () => void;
  steps: StepRecord[];
  total: number;
  currentIndex: number;
  stepProgress: number;
  isActive: boolean;
  isComplete: boolean;
  currentInstruction?: string;
  replayMode?: "walkthrough" | "auto" | null;
  onReplay?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children?: React.ReactNode;
  hudRef?: React.Ref<HTMLDivElement>;
  agentActions?: AgentActionEvent[];
}

const STATUS_LABEL: Record<StepRecord["status"], string> = {
  completed: "Done",
  current: "In progress",
  upcoming: "Up next",
  corrected: "Corrected",
};

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  expanded,
  onToggleExpand,
  steps,
  total,
  currentIndex,
  stepProgress,
  isActive,
  isComplete,
  currentInstruction,
  replayMode,
  onReplay,
  onMouseEnter,
  onMouseLeave,
  children,
  hudRef,
  agentActions = [],
}) => {
  const summary = useMemo(() => stepSummary(steps), [steps]);
  const displayIndex = isComplete ? total : currentIndex + 1;
  const hasSteps = total > 0 && steps.length > 0;

  const handleRailClick = () => {
    if (!expanded) onToggleExpand();
  };

  return (
    <aside
      ref={hudRef}
      className={`specter-progress-rail specter-progress-tracker specter-hud-shell ${expanded ? "is-expanded" : "is-collapsed"}`}
      onClick={handleRailClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="complementary"
      aria-label="Task progress"
    >
      <header
        className="specter-rail-header specter-rail-header--interactive"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        <div className="specter-rail-brand">
          <span className="specter-rail-logo" aria-hidden="true">
            <CuteGhostSvg size={22} expression="happy" />
          </span>
          {expanded ? (
            <div>
              <div className="specter-rail-title">Specter</div>
              <div className="specter-rail-subtitle">
                Powered by{" "}
                <a
                  href="https://www.openui.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="specter-openui-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  OpenUI
                </a>
              </div>
            </div>
          ) : (
            <div className="specter-rail-collapsed-meta">
              <span className="specter-rail-collapsed-count">
                {hasSteps ? `${displayIndex}/${total}` : "—"}
              </span>
              <span className="specter-rail-collapsed-label">Progress</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="specter-rail-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={
            expanded ? "Collapse progress panel" : "Expand progress panel"
          }
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▸" : "◂"}
        </button>
      </header>

      {!expanded && hasSteps && (
        <div className="specter-rail-collapsed-bar" aria-hidden="true">
          <div
            className="specter-rail-collapsed-fill"
            style={{ height: `${Math.round(stepProgress * 100)}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="specter-rail-body" onClick={(e) => e.stopPropagation()}>
          {hasSteps && (
            <section className="specter-rail-steps">
              <div className="specter-rail-section-head">
                <span>Progress</span>
                <span className="specter-rail-step-count">
                  {displayIndex} / {total}
                </span>
              </div>

              <div className="specter-rail-summary-row">
                <Tag
                  text={`${summary.completed} done`}
                  variant="success"
                  size="sm"
                />
                <Tag
                  text={`${summary.current} active`}
                  variant="info"
                  size="sm"
                />
                <Tag
                  text={`${summary.upcoming} left`}
                  variant="neutral"
                  size="sm"
                />
                {summary.corrected > 0 && (
                  <Tag
                    text={`${summary.corrected} fixed`}
                    variant="warning"
                    size="sm"
                  />
                )}
                {isActive && replayMode && (
                  <Tag
                    text={replayMode === "walkthrough" ? "Walkthrough" : "Auto"}
                    variant="info"
                    size="sm"
                  />
                )}
              </div>

              <div className="specter-rail-progress-track">
                <div
                  className="specter-rail-progress-fill"
                  style={{ width: `${Math.round(stepProgress * 100)}%` }}
                />
              </div>

              {currentInstruction && isActive && (
                <div className="specter-rail-current-step">
                  {currentInstruction}
                </div>
              )}

              <div className="specter-rail-steps-list specter-rail-steps-list--full">
                <Steps>
                  {steps.map((step) => (
                    <StepsItem
                      key={`step-${step.index}-${step.status}`}
                      number={step.index + 1}
                      title={STATUS_LABEL[step.status]}
                      details={step.instruction}
                    />
                  ))}
                </Steps>
              </div>

              {agentActions && agentActions.length > 0 && (
                <section className="specter-rail-agent-log">
                  <div className="specter-rail-section-head">
                    <span>Agent actions</span>
                    <Tag
                      text={agentActions.length > 5 ? `last 5 of ${agentActions.length}` : "live"}
                      variant="info"
                      size="sm"
                    />
                  </div>
                  <div className="specter-rail-agent-log-list">
                    {agentActions.slice(-5).map((action) => (
                      <div
                        key={action.id}
                        className={`specter-rail-agent-entry specter-rail-agent-entry--${action.status}`}
                      >
                        <div className="specter-rail-agent-entry-head">
                          <span className="specter-rail-agent-status-dot" />
                          <span className="specter-rail-agent-label">{action.label}</span>
                        </div>
                        {action.detail && (
                          <div className="specter-rail-agent-detail">{action.detail}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {isComplete && onReplay && (
                <Button
                  variant="secondary"
                  size="small"
                  className="specter-rail-replay-btn"
                  onClick={onReplay}
                >
                  Replay walkthrough
                </Button>
              )}
            </section>
          )}

          {!hasSteps && (
            <section className="specter-rail-empty">
              <div className="specter-rail-greeting">How can I help?</div>
              <p className="specter-rail-empty-copy">
                Start a walkthrough or ask Specter to guide you. Steps will
                appear here as you go — done, active, and what&apos;s left.
              </p>
            </section>
          )}

          {children}
        </div>
      )}
    </aside>
  );
};
