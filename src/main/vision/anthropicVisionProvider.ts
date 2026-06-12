import {
  VisionProvider,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "./types";
import { VisionProviderError } from "./errors";
import { createAnthropicClient, getAnthropicVisionModel } from "../ai/config";
import { buildVisionPrompt } from "./prompts";
import { parseVisionJson } from "./json";
import { safeLog } from "../logger";

export class AnthropicVisionProvider implements VisionProvider {
  public name = "anthropic" as const;
  private readonly model = getAnthropicVisionModel();

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const startTime = Date.now();
    const anthropic = createAnthropicClient();

    if (!anthropic) {
      throw new VisionProviderError(
        "PROVIDER_NOT_CONFIGURED",
        this.name,
        "Anthropic API key is missing.",
      );
    }

    const timeoutMs = parseInt(
      process.env.ANTHROPIC_VISION_TIMEOUT_MS || "20000",
      10,
    );
    let timeoutId: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new VisionProviderError(
            "PROVIDER_TIMEOUT",
            this.name,
            `Anthropic vision request timed out after ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);
    });

    try {
      safeLog(`[VISION][ANTHROPIC] Calling ${this.model}...`, {
        task: input.task,
      });

      const prompt = buildVisionPrompt(
        input.task,
        input.userPrompt,
        input.appContext,
        input.screenshotWidth,
        input.screenshotHeight,
      );

      const message = await Promise.race([
        anthropic.messages.create({
          model: this.model,
          max_tokens: 1200,
          system:
            "You are a UI state analyzer. Return ONLY valid JSON matching the requested schema.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: input.mimeType,
                    data: input.imageBase64,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
        timeout,
      ]);
      if (timeoutId) clearTimeout(timeoutId);

      const content = message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");

      const parsed = parseVisionJson(content, this.name, {
        width: input.screenshotWidth,
        height: input.screenshotHeight,
      });

      const latencyMs = Date.now() - startTime;

      return {
        provider: this.name,
        model: this.model,
        generatedAt: new Date().toISOString(),
        latencyMs,
        summary: parsed.summary,
        elements: parsed.elements,
        recommendedAction: parsed.recommendedAction,
        warnings: parsed.warnings,
        rawText: process.env.NODE_ENV !== "production" ? content : undefined,
      };
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof VisionProviderError) {
        throw error;
      }

      throw new VisionProviderError(
        "PROVIDER_HTTP_ERROR",
        this.name,
        error.message || "Anthropic API error",
        undefined,
        error,
      );
    }
  }
}
