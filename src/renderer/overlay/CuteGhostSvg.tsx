import React, { useId } from "react";

export type CuteGhostExpression =
  | "happy"
  | "speaking"
  | "excited"
  | "wink"
  | "thinking";

interface CuteGhostSvgProps {
  size?: number;
  expression?: CuteGhostExpression;
  className?: string;
}

export const CuteGhostSvg: React.FC<CuteGhostSvgProps> = ({
  size = 36,
  expression = "happy",
  className,
}) => {
  const uid = useId().replace(/:/g, "");
  const gradId = `ghost-grad-${uid}`;
  const glowId = `ghost-glow-${uid}`;

  const height = Math.round(size * (40 / 36));

  const renderFace = () => {
    const blush = (
      <>
        <ellipse
          className="cute-ghost__blush"
          cx="11.5"
          cy="21.5"
          rx="2.2"
          ry="1.2"
        />
        <ellipse
          className="cute-ghost__blush"
          cx="24.5"
          cy="21.5"
          rx="2.2"
          ry="1.2"
        />
      </>
    );

    if (expression === "speaking") {
      return (
        <>
          {blush}
          <circle className="cute-ghost__eye" cx="13.5" cy="17.5" r="3.2" />
          <circle className="cute-ghost__eye" cx="22.5" cy="17.5" r="3.2" />
          <circle className="cute-ghost__shine" cx="14.6" cy="16.4" r="1.1" />
          <circle className="cute-ghost__shine" cx="23.6" cy="16.4" r="1.1" />
          <circle className="cute-ghost__mouth-o" cx="18" cy="24" r="2.2" />
        </>
      );
    }

    if (expression === "excited") {
      return (
        <>
          {blush}
          <circle className="cute-ghost__eye wide" cx="13.5" cy="17.5" r="3.8" />
          <circle className="cute-ghost__eye wide" cx="22.5" cy="17.5" r="3.8" />
          <circle className="cute-ghost__shine" cx="14.8" cy="16.2" r="1.3" />
          <circle className="cute-ghost__shine" cx="23.8" cy="16.2" r="1.3" />
          <path
            className="cute-ghost__mouth happy"
            d="M12.5 23.5c2.2 3.2 9.3 3.2 11 0"
          />
        </>
      );
    }

    if (expression === "wink") {
      return (
        <>
          {blush}
          <circle className="cute-ghost__eye" cx="13.5" cy="17.5" r="3.2" />
          <path
            className="cute-ghost__eye-line"
            d="M19.5 17.5c1.8-1.6 3.8-1.6 6 0"
          />
          <circle className="cute-ghost__shine" cx="14.6" cy="16.4" r="1.1" />
          <path
            className="cute-ghost__mouth happy"
            d="M13 23.5c2 2.4 7 2.4 10 0"
          />
        </>
      );
    }

    if (expression === "thinking") {
      return (
        <>
          {blush}
          <circle className="cute-ghost__eye" cx="13.5" cy="18" r="3" />
          <circle className="cute-ghost__eye" cx="22.5" cy="17" r="3" />
          <circle className="cute-ghost__shine" cx="14.5" cy="17" r="1" />
          <circle className="cute-ghost__shine" cx="23.5" cy="16" r="1" />
          <circle className="cute-ghost__mouth-o" cx="18" cy="23.5" r="1.6" />
        </>
      );
    }

    return (
      <>
        {blush}
        <circle className="cute-ghost__eye" cx="13.5" cy="17.5" r="3.2" />
        <circle className="cute-ghost__eye" cx="22.5" cy="17.5" r="3.2" />
        <circle className="cute-ghost__shine" cx="14.6" cy="16.4" r="1.1" />
        <circle className="cute-ghost__shine" cx="23.6" cy="16.4" r="1.1" />
        <path
          className="cute-ghost__mouth happy"
          d="M13.5 23c1.8 2.2 7.2 2.2 9 0"
        />
      </>
    );
  };

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 36 40"
      className={["cute-ghost__svg", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--openui-text-white)" />
          <stop offset="72%" stopColor="var(--openui-info-background)" />
          <stop offset="100%" stopColor="color-mix(in oklch, var(--openui-border-info-emphasis) 22%, var(--openui-text-white))" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${glowId})`}>
        <ellipse
          className="cute-ghost__arm"
          cx="5.5"
          cy="21"
          rx="2.6"
          ry="4"
          transform="rotate(18 5.5 21)"
        />
        <ellipse
          className="cute-ghost__arm"
          cx="30.5"
          cy="21"
          rx="2.6"
          ry="4"
          transform="rotate(-18 30.5 21)"
        />
        <path
          className="cute-ghost__body"
          fill={`url(#${gradId})`}
          d="M18 3C10.8 3 6 9.2 6 16.5V30c0 1.1 1.3 1.7 2.1 1l2.5-2.1 2.6 2.8c0.75 0.8 2 0.8 2.75 0l2-2.2 2 2.2c0.75 0.8 2 0.8 2.75 0l2.6-2.8 2.5 2.1c0.8 0.6 2.1 0 2.1-1V16.5C30 9.2 25.2 3 18 3Z"
        />
        <path
          className="cute-ghost__shine-stroke"
          d="M11 9.5c1.4-2.6 3.6-4.2 7-4.8"
        />
        <circle className="cute-ghost__shine-dot" cx="10" cy="12" r="1" />
      </g>

      <g className="cute-ghost__face">{renderFace()}</g>
    </svg>
  );
};
