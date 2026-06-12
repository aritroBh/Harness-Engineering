import React from "react";
import { Callout } from "@openuidev/react-ui";

export interface ReasoningLine {
  text: string;
  active?: boolean;
}

interface ReasoningBubblesProps {
  lines: ReasoningLine[];
}

export const ReasoningBubbles: React.FC<ReasoningBubblesProps> = ({
  lines,
}) => {
  if (lines.length === 0) return null;

  return (
    <div className="reasoning-bubbles" aria-live="polite" aria-atomic="false">
      {lines.map((line, index) => (
        <Callout
          key={`${index}-${line.text}`}
          variant={line.active ? "info" : "neutral"}
          title={line.active ? "Thinking" : "Observed"}
          description={line.text}
          className={`reasoning-bubble-callout ${line.active ? "is-active" : "is-done"}`}
        />
      ))}
    </div>
  );
};
