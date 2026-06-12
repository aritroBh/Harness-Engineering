import {
  VisionProvider,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "./types";
import { VisionProviderError } from "./errors";
import { buildVisionPrompt } from "./prompts";
import { parseVisionJson } from "./json";
import { safeLog } from "../logger";

const DEFAULT_NVIDIA_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NVIDIA_MODEL = "meta/llama-4-maverick-17b-128e-instruct";

function envNumber(
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
}

function envInteger(
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  return Math.round(envNumber(name, fallback, min, max));
}

function envBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

async function readStreamingContent(response: Response): Promise<string> {
  if (!response.body) {
    throw new VisionProviderError(
      "PROVIDER_INVALID_RESPONSE",
      "nvidia",
      "NVIDIA API returned an empty streaming response body.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  let reading = true;
  while (reading) {
    const { done, value } = await reader.read();
    if (done) {
      reading = false;
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        const message = parsed.choices?.[0]?.message?.content;
        if (typeof delta === "string") content += delta;
        if (typeof message === "string") content += message;
      } catch {
        throw new VisionProviderError(
          "PROVIDER_INVALID_RESPONSE",
          "nvidia",
          "NVIDIA API returned a streaming chunk that was not valid JSON.",
        );
      }
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const payload = tail.slice("data:".length).trim();
    if (payload && payload !== "[DONE]") {
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        const message = parsed.choices?.[0]?.message?.content;
        if (typeof delta === "string") content += delta;
        if (typeof message === "string") content += message;
      } catch {
        throw new VisionProviderError(
          "PROVIDER_INVALID_RESPONSE",
          "nvidia",
          "NVIDIA API returned a final streaming chunk that was not valid JSON.",
        );
      }
    }
  }

  return content;
}

async function readNvidiaContent(
  response: Response,
  stream: boolean,
): Promise<string> {
  if (stream) {
    return readStreamingContent(response);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new VisionProviderError(
      "PROVIDER_INVALID_RESPONSE",
      "nvidia",
      "NVIDIA API returned an invalid response structure.",
    );
  }

  return content;
}

export class NvidiaVisionProvider implements VisionProvider {
  public name = "nvidia" as const;

  private get model(): string {
    return process.env.NVIDIA_VISION_MODEL || DEFAULT_NVIDIA_MODEL;
  }

  private get endpoint(): string {
    return (
      process.env.NVIDIA_CHAT_COMPLETIONS_URL ||
      process.env.NVIDIA_INVOKE_URL ||
      DEFAULT_NVIDIA_ENDPOINT
    );
  }

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const startTime = Date.now();
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey || apiKey === "your_nvidia_api_key_here") {
      throw new VisionProviderError(
        "PROVIDER_NOT_CONFIGURED",
        this.name,
        "NVIDIA API key is missing or not configured.",
      );
    }

    const timeoutMs = parseInt(
      process.env.NVIDIA_VISION_TIMEOUT_MS || "20000",
      10,
    );
    const stream = envBoolean("NVIDIA_VISION_STREAM", false);
    const maxTokens = envInteger("NVIDIA_VISION_MAX_TOKENS", 1200, 1);
    const temperature = envNumber("NVIDIA_VISION_TEMPERATURE", 0.1, 0, 2);
    const topP = envNumber("NVIDIA_VISION_TOP_P", 1, 0, 1);
    const frequencyPenalty = envNumber(
      "NVIDIA_VISION_FREQUENCY_PENALTY",
      0,
      -2,
      2,
    );
    const presencePenalty = envNumber(
      "NVIDIA_VISION_PRESENCE_PENALTY",
      0,
      -2,
      2,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const prompt = buildVisionPrompt(
      input.task,
      input.userPrompt,
      input.appContext,
      input.screenshotWidth,
      input.screenshotHeight,
    );

    try {
      safeLog(`[VISION][NVIDIA] Calling ${this.model}...`, {
        task: input.task,
      });

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: stream ? "text/event-stream" : "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
          stream,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        throw new VisionProviderError(
          "PROVIDER_NOT_CONFIGURED",
          this.name,
          "NVIDIA API authentication failed. Please check your API key.",
        );
      }

      if (response.status === 429) {
        throw new VisionProviderError(
          "PROVIDER_RATE_LIMITED",
          this.name,
          "NVIDIA API rate limit exceeded.",
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new VisionProviderError(
          "PROVIDER_HTTP_ERROR",
          this.name,
          `NVIDIA API returned status ${response.status}`,
          errorText.substring(0, 500),
        );
      }

      const content = await readNvidiaContent(response, stream);

      const parsed = parseVisionJson(content, this.name, {
        width: input.screenshotWidth,
        height: input.screenshotHeight,
      });
      const latencyMs = Date.now() - startTime;

      safeLog(`[VISION][NVIDIA] Success`, {
        latencyMs,
        elementCount: parsed.elements.length,
      });

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
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        throw new VisionProviderError(
          "PROVIDER_TIMEOUT",
          this.name,
          `NVIDIA API request timed out after ${timeoutMs}ms.`,
        );
      }

      if (error instanceof VisionProviderError) {
        throw error;
      }

      throw new VisionProviderError(
        "UNKNOWN_VISION_ERROR",
        this.name,
        error.message ||
          "An unexpected error occurred during NVIDIA vision analysis.",
        undefined,
        error,
      );
    }
  }
}
