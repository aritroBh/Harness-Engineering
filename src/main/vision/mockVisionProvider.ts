import {
  VisionProvider,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "./types";
import { VisionProviderError } from "./errors";

export class MockVisionProvider implements VisionProvider {
  public name = "mock" as const;

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const isAllowed =
      process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";

    if (!isAllowed) {
      throw new VisionProviderError(
        "VISION_PROVIDER_NOT_ALLOWED",
        this.name,
        "Mock vision provider is not allowed in production unless DEMO_MODE is true.",
      );
    }

    return {
      provider: this.name,
      model: "mock-vision-v1",
      generatedAt: new Date().toISOString(),
      latencyMs: 150,
      summary: `Mock analysis for task: ${input.task}`,
      elements: [
        {
          label: "Mock Button",
          type: "button",
          text: "Click Me",
          confidence: 0.95,
          bbox: { x: 100, y: 100, width: 80, height: 30 },
          center: { x: 140, y: 115 },
          reasoning: "Mock element for development",
        },
      ],
      recommendedAction: "Click the mock button",
      warnings: ["This is a mock response"],
    };
  }
}
