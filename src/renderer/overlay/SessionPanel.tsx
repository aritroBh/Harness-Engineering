import React from "react";
import { Button, Buttons, Card, CardHeader, Tag } from "@openuidev/react-ui";

interface SessionPanelProps {
  intent: string;
  nodeId?: string;
  appName?: string;
  isBusy?: boolean;
  isWalkthroughActive?: boolean;
  stepProgress?: number;
  onWalkthrough: () => void;
  onAutoExecute: () => void;
}

export const SessionPanel: React.FC<SessionPanelProps> = ({
  intent,
  nodeId,
  appName,
  isBusy = false,
  isWalkthroughActive = false,
  stepProgress = 0,
  onWalkthrough,
  onAutoExecute,
}) => {
  if (!intent) return null;

  const normalizedStepProgress = Math.min(1, Math.max(0, stepProgress));
  const disabled = isBusy || !nodeId;

  return (
    <Card variant="sunk" className="session-panel openui-session-panel">
      <CardHeader title="Goal" subtitle={intent} />
      <div className="openui-session-meta">
        <Tag text={appName || "Unknown app"} />
        <Tag
          text={isWalkthroughActive ? "Walkthrough active" : "Ready to guide"}
          variant={isWalkthroughActive ? "success" : "neutral"}
        />
      </div>

      <Buttons variant="horizontal" className="openui-session-actions">
        <Button
          variant="secondary"
          size="small"
          disabled={disabled}
          onClick={onWalkthrough}
        >
          Walk me through
        </Button>
        <Button
          variant="primary"
          size="small"
          disabled={disabled}
          onClick={onAutoExecute}
        >
          Do it for me
        </Button>
      </Buttons>

      {isWalkthroughActive && (
        <div className="openui-session-progress">
          <span>Step progress</span>
          <div className="specter-rail-progress-track">
            <div
              className="specter-rail-progress-fill"
              style={{ width: `${Math.round(normalizedStepProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
};
