import React from "react";

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
        <div
          key={`${index}-${line.text}`}
          className={`reasoning-bubble ${line.active ? "is-active" : "is-done"}`}
        >
          {line.active && (
            <span className="reasoning-bubble__dot" aria-hidden />
          )}
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
};
