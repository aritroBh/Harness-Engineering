import {
  classifyAnthropicError,
  createAnthropicClient,
  getAnthropicApiKey,
  getAnthropicBaseUrlForMode,
  getAnthropicModel,
  getAnthropicVisionModel,
  getUseLocalModel,
  isLocalhostUrl,
  OFFICIAL_ANTHROPIC_BASE_URL,
} from "./config";

interface KeyHealth {
  present: boolean;
  keyLength: number;
  placeholderDetected: boolean;
}

interface AnthropicHealth {
  key: KeyHealth;
  configured: boolean;
  useLocalModel: boolean;
  baseURLKind: "official" | "local" | "custom";
  baseURLOfficial: boolean;
  plannerModel: string;
  visionModel: string;
  testRequest: {
    attempted: boolean;
    pass: boolean;
    category?: string;
    status?: number;
    reason?: string;
  };
}

interface GeminiHealth {
  key: KeyHealth;
  transcribeConfigured: boolean;
}

interface ElevenLabsHealth {
  key: KeyHealth;
  configured: boolean;
  voiceId: string;
  modelId: string;
  reason?: string;
}

interface GeminiTTSHealth {
  key: KeyHealth;
  configured: boolean;
  model: string;
  voice: string;
}

interface OverallHealth {
  readyForRealAppAI: boolean;
  readyForVoiceInput: boolean;
  readyForNaturalVoiceOutput: boolean;
  /** true = key is present but no runtime test was performed; "configured" ≠ "working" */
  naturalVoiceConfiguredOnly: boolean;
}

export interface AIHealthResult {
  ok: boolean;
  overall: OverallHealth;
  anthropic: AnthropicHealth;
  gemini: GeminiHealth;
  geminiTTS: GeminiTTSHealth;
  elevenlabs: ElevenLabsHealth;
}

function keyHealth(value: string | undefined): KeyHealth {
  const trimmed = value?.trim() || "";
  const placeholderDetected = !trimmed
    ? false
    : /placeholder|changeme|change_me|replace|your[_-]?key|xxx|sk-xxx|test[_-]?key/i.test(
        trimmed,
      );

  return {
    present: Boolean(trimmed),
    keyLength: trimmed.length,
    placeholderDetected,
  };
}

function baseURLKind(
  baseURL: string,
  useLocalModel: boolean,
): "official" | "local" | "custom" {
  if (baseURL === OFFICIAL_ANTHROPIC_BASE_URL) return "official";
  if (useLocalModel || isLocalhostUrl(baseURL)) return "local";
  return "custom";
}

function friendlyAnthropicReason(category: string, status?: number): string {
  if (category === "auth_error")
    return "Anthropic authentication failed. Check ANTHROPIC_API_KEY.";
  if (category === "network_error")
    return "Anthropic could not be reached from this machine.";
  if (category === "model_error")
    return "The selected Anthropic model is unavailable for this key.";
  if (category === "rate_limit") return "Anthropic rate limit reached.";
  if (category === "api_key_missing") return "ANTHROPIC_API_KEY is missing.";
  return status
    ? `Anthropic request failed with status ${status}.`
    : "Anthropic request failed.";
}

const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_turbo_v2";

export async function checkAIHealth(): Promise<AIHealthResult> {
  const anthropicKey = keyHealth(getAnthropicApiKey());
  const geminiKey = keyHealth(process.env.GEMINI_API_KEY);
  const elevenlabsKey = keyHealth(process.env.ELEVENLABS_API_KEY);
  const useLocalModel = getUseLocalModel();
  const baseURL = getAnthropicBaseUrlForMode();

  const result: AIHealthResult = {
    ok: false,
    overall: {
      readyForRealAppAI: false,
      readyForVoiceInput: false,
      readyForNaturalVoiceOutput: false,
      naturalVoiceConfiguredOnly: false,
    },
    anthropic: {
      key: anthropicKey,
      configured: anthropicKey.present && !anthropicKey.placeholderDetected,
      useLocalModel,
      baseURLKind: baseURLKind(baseURL, useLocalModel),
      baseURLOfficial: baseURL === OFFICIAL_ANTHROPIC_BASE_URL,
      plannerModel: getAnthropicModel(),
      visionModel: getAnthropicVisionModel(),
      testRequest: {
        attempted: false,
        pass: false,
      },
    },
    gemini: {
      key: geminiKey,
      transcribeConfigured: geminiKey.present && !geminiKey.placeholderDetected,
    },
    geminiTTS: {
      key: geminiKey,
      configured: geminiKey.present && !geminiKey.placeholderDetected,
      model: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
      voice: process.env.GEMINI_TTS_VOICE || "Kore",
    },
    elevenlabs: {
      key: elevenlabsKey,
      configured: elevenlabsKey.present && !elevenlabsKey.placeholderDetected,
      voiceId: process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID,
      modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    },
  };

  if (!result.anthropic.configured) {
    result.anthropic.testRequest = {
      attempted: false,
      pass: false,
      category: anthropicKey.present ? "auth_error" : "api_key_missing",
      reason: anthropicKey.present
        ? "Anthropic key looks like placeholder text."
        : "ANTHROPIC_API_KEY is missing.",
    };
  } else {
    const client = createAnthropicClient();
    if (!client) {
      result.anthropic.testRequest = {
        attempted: false,
        pass: false,
        category: "api_key_missing",
        reason: "ANTHROPIC_API_KEY is missing.",
      };
    } else {
      result.anthropic.testRequest.attempted = true;
      try {
        const message = await client.messages.create({
          model: getAnthropicModel(),
          max_tokens: 8,
          messages: [
            {
              role: "user",
              content: "Return OK",
            },
          ],
        });
        const text = message.content
          .flatMap((part) =>
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string"
              ? [part.text]
              : [],
          )
          .join("\n")
          .trim();

        result.anthropic.testRequest.pass =
          /^ok\.?$/i.test(text) || /ok/i.test(text);
        if (!result.anthropic.testRequest.pass) {
          result.anthropic.testRequest.category = "unknown";
          result.anthropic.testRequest.reason =
            "Anthropic responded, but not with OK.";
        }
      } catch (error: any) {
        const summary = classifyAnthropicError(error);
        result.anthropic.testRequest.pass = false;
        result.anthropic.testRequest.category = summary.category;
        result.anthropic.testRequest.status = summary.status;
        result.anthropic.testRequest.reason = friendlyAnthropicReason(
          summary.category,
          summary.status,
        );
      }
    }
  }

  result.overall.readyForRealAppAI =
    result.anthropic.configured && result.anthropic.testRequest.pass;
  result.overall.readyForVoiceInput = result.gemini.transcribeConfigured;

  // "configured" = key present; runtime test NOT performed here (expensive).
  // Use naturalVoiceConfiguredOnly=true to signal that "ready" means configured,
  // not verified. Use the testVoiceOutput IPC to do a live end-to-end check.
  const voiceProviderConfigured =
    result.elevenlabs.configured || result.geminiTTS.configured;
  result.overall.readyForNaturalVoiceOutput = voiceProviderConfigured;
  result.overall.naturalVoiceConfiguredOnly = voiceProviderConfigured;

  result.ok =
    result.overall.readyForRealAppAI &&
    result.overall.readyForVoiceInput &&
    result.overall.readyForNaturalVoiceOutput;

  return result;
}
