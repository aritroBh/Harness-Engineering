import Anthropic from "@anthropic-ai/sdk";
import { safeLog, safeWarn } from "../logger";

export const OFFICIAL_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export type AnthropicErrorCategory =
  | "api_key_missing"
  | "auth_error"
  | "network_error"
  | "model_error"
  | "rate_limit"
  | "unknown";

export interface AnthropicErrorSummary {
  category: AnthropicErrorCategory;
  status?: number;
  name?: string;
  message?: string;
}

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
}

export function getAnthropicVisionModel(): string {
  return process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-4-6";
}

export function getUseLocalModel(): boolean {
  return process.env.USE_LOCAL_MODEL === "true";
}

export function getLocalModelBaseUrl(): string | undefined {
  if (process.env.USE_LOCAL_MODEL !== "true") {
    return undefined;
  }
  return process.env.LOCAL_MODEL_BASE_URL || process.env.ANTHROPIC_BASE_URL;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function getAnthropicBaseUrlForMode(): string {
  if (getUseLocalModel()) {
    return getLocalModelBaseUrl() || OFFICIAL_ANTHROPIC_BASE_URL;
  }
  return OFFICIAL_ANTHROPIC_BASE_URL;
}

export function classifyAnthropicError(error: any): AnthropicErrorSummary {
  const status =
    typeof error?.status === "number"
      ? error.status
      : typeof error?.response?.status === "number"
        ? error.response.status
        : undefined;
  const name = typeof error?.name === "string" ? error.name : undefined;
  const message =
    typeof error?.message === "string" ? error.message : String(error || "");
  const causeMessage =
    typeof error?.cause?.message === "string" ? error.cause.message : "";
  const combined = `${name || ""} ${message} ${causeMessage}`.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    /auth|unauthorized|forbidden|api key|invalid x-api-key/.test(combined)
  ) {
    return { category: "auth_error", status, name, message };
  }

  if (status === 429 || /rate limit|too many requests/.test(combined)) {
    return { category: "rate_limit", status, name, message };
  }

  if (
    status === 404 ||
    (status === 400 && /model/.test(combined)) ||
    /model.*not found|model.*access|unsupported model|invalid model/.test(
      combined,
    )
  ) {
    return { category: "model_error", status, name, message };
  }

  if (
    /network|fetch|connection|econn|enotfound|etimedout|timeout|socket|dns|offline|11434/.test(
      combined,
    ) ||
    name === "APIConnectionError"
  ) {
    return { category: "network_error", status, name, message };
  }

  return { category: "unknown", status, name, message };
}

export function createAnthropicClient(): Anthropic | null {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return null;
  }

  const useLocal = getUseLocalModel();

  if (!useLocal) {
    const envBaseUrl =
      process.env.ANTHROPIC_BASE_URL || process.env.LOCAL_MODEL_BASE_URL;
    if (envBaseUrl && isLocalhostUrl(envBaseUrl)) {
      safeWarn(
        "[AI_BACKEND] Ignoring localhost Anthropic base URL because USE_LOCAL_MODEL is not true",
      );
    }
    // Force official Anthropic endpoint so the SDK cannot read ANTHROPIC_BASE_URL from process.env
    return new Anthropic({ apiKey, baseURL: OFFICIAL_ANTHROPIC_BASE_URL });
  }

  // Local mode
  const localBaseUrl = getLocalModelBaseUrl();
  if (localBaseUrl) {
    safeLog("[AI_BACKEND] Using local model endpoint:", localBaseUrl);
    return new Anthropic({ apiKey, baseURL: localBaseUrl });
  }

  safeWarn(
    "[AI_BACKEND] USE_LOCAL_MODEL is true but no local base URL is set; falling back to official Anthropic API",
  );
  return new Anthropic({ apiKey, baseURL: OFFICIAL_ANTHROPIC_BASE_URL });
}
