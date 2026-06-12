import {
  VisionProvider,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
  VisionProviderName,
} from "./types";
import { NvidiaVisionProvider } from "./nvidiaVisionProvider";
import { AnthropicVisionProvider } from "./anthropicVisionProvider";
import { MockVisionProvider } from "./mockVisionProvider";
import { VisionProviderError } from "./errors";
import { safeWarn, safeError } from "../logger";

let nvidiaProvider: NvidiaVisionProvider | null = null;
let anthropicProvider: AnthropicVisionProvider | null = null;
let mockProvider: MockVisionProvider | null = null;

export function getVisionProvider(name?: VisionProviderName): VisionProvider {
  const providerName =
    name || (process.env.VISION_PROVIDER as VisionProviderName) || "nvidia";

  switch (providerName) {
    case "nvidia":
      if (!nvidiaProvider) nvidiaProvider = new NvidiaVisionProvider();
      return nvidiaProvider;
    case "anthropic":
      if (!anthropicProvider) anthropicProvider = new AnthropicVisionProvider();
      return anthropicProvider;
    case "mock":
      if (!mockProvider) mockProvider = new MockVisionProvider();
      return mockProvider;
    default:
      throw new VisionProviderError(
        "PROVIDER_NOT_CONFIGURED",
        "nvidia", // Defaulting to nvidia in error
        `Unknown vision provider: ${providerName}`,
      );
  }
}

export async function analyzeVision(
  input: VisionAnalyzeInput,
): Promise<VisionAnalyzeResult> {
  const primaryProvider = getVisionProvider();

  try {
    return await primaryProvider.analyze(input);
  } catch (error: any) {
    const isFallbackEnabled = process.env.VISION_FALLBACK_ENABLED === "true";
    const canFallback = primaryProvider.name === "nvidia" && isFallbackEnabled;

    if (canFallback) {
      safeWarn(
        `[VISION] Primary provider (${primaryProvider.name}) failed. Attempting fallback to Anthropic...`,
        {
          error: error.message,
        },
      );

      try {
        const fallbackProvider = getVisionProvider("anthropic");
        const result = await fallbackProvider.analyze(input);

        return {
          ...result,
          fallbackUsed: true,
          fallbackFrom: primaryProvider.name as VisionProviderName,
        };
      } catch (fallbackError: any) {
        safeError(`[VISION] Fallback provider (anthropic) also failed.`, {
          error: fallbackError.message,
        });
        // Rethrow the original primary error or the fallback error?
        // Usually primary error is more relevant to why the first choice failed.
        throw error;
      }
    }

    throw error;
  }
}

export function getConfiguredVisionProviderName(): VisionProviderName {
  return (process.env.VISION_PROVIDER as VisionProviderName) || "nvidia";
}

export * from "./types";
export * from "./errors";
