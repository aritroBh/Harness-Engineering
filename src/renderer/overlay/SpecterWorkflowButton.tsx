import React from "react";
import { Button, type ButtonProps } from "@openuidev/react-ui";

interface SpecterWorkflowButtonProps extends ButtonProps {
  primary?: boolean;
}

export const SpecterWorkflowButton: React.FC<SpecterWorkflowButtonProps> = ({
  primary = false,
  variant,
  size = "small",
  className,
  children,
  ...props
}) => (
  <Button
    variant={variant ?? (primary ? "primary" : "secondary")}
    size={size}
    className={[
      "specter-workflow-btn",
      primary ? "is-manual-primary" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </Button>
);
