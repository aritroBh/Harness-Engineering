import React from "react";
import { CuteGhostSvg, type CuteGhostExpression } from "./CuteGhostSvg";

interface GhostCursorIconProps {
  className?: string;
  speaking?: boolean;
  expression?: CuteGhostExpression;
  size?: number;
}

export const GhostCursorIcon: React.FC<GhostCursorIconProps> = ({
  className,
  speaking = false,
  expression,
  size = 36,
}) => {
  const resolvedExpression: CuteGhostExpression =
    expression ?? (speaking ? "speaking" : "happy");

  return (
    <div
      className={[
        "openui-ghost-cursor",
        speaking ? "openui-ghost-cursor--speaking" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {speaking && (
        <>
          <span className="openui-ghost-cursor__wave" />
          <span className="openui-ghost-cursor__wave openui-ghost-cursor__wave--delay" />
        </>
      )}
      <CuteGhostSvg size={size} expression={resolvedExpression} />
    </div>
  );
};
