export type VisionProviderName = "nvidia" | "anthropic" | "mock";

export type VisionTask =
  | "screen_understanding"
  | "target_detection"
  | "walkthrough_planning"
  | "permission_dialog_detection"
  | "active_app_summary";

export type VisionAnalyzeInput = {
  imageBase64: string;
  mimeType: "image/png" | "image/jpeg";
  task: VisionTask;
  userPrompt?: string;
  appContext?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
};

export type VisionBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisionPoint = {
  x: number;
  y: number;
};

export type VisionElement = {
  label: string;
  type?:
    | "button"
    | "input"
    | "menu"
    | "dialog"
    | "text"
    | "icon"
    | "window"
    | "tab"
    | "checkbox"
    | "toggle"
    | "unknown";
  text?: string;
  confidence?: number;
  bbox?: VisionBoundingBox;
  center?: VisionPoint;
  reasoning?: string;
};

export type VisionAnalyzeResult = {
  provider: VisionProviderName;
  model: string;
  generatedAt: string;
  latencyMs?: number;
  summary: string;
  elements: VisionElement[];
  recommendedAction?: string;
  warnings: string[];
  rawText?: string;
  fallbackUsed?: boolean;
  fallbackFrom?: VisionProviderName;
};

export type VisionProvider = {
  name: VisionProviderName;
  analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult>;
};
