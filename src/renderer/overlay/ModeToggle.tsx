import React from "react";
import { Button, Buttons } from "@openuidev/react-ui";

interface ModeToggleProps {
  mode: "silent" | "ultra" | "ghostwiki";
  onChange: (mode: "silent" | "ultra") => void;
  memoryOpen: boolean;
  onToggleMemory: () => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({
  mode,
  onChange,
  memoryOpen,
  onToggleMemory,
}) => {
  return (
    <div className="specter-mode-row openui-mode-row">
      <Buttons variant="horizontal" className="openui-mode-buttons">
        <Button
          variant={mode !== "ultra" ? "primary" : "secondary"}
          size="small"
          onClick={() => onChange("silent")}
        >
          Chat
        </Button>
        <Button
          variant={mode === "ultra" ? "primary" : "secondary"}
          size="small"
          onClick={() => onChange("ultra")}
        >
          Voice
        </Button>
      </Buttons>
      <Button
        variant={memoryOpen ? "primary" : "tertiary"}
        size="small"
        onClick={onToggleMemory}
        aria-pressed={memoryOpen}
      >
        Memory
      </Button>
    </div>
  );
};
