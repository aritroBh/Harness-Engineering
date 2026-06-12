import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { File as NodeFile } from "node:buffer";
import { safeLog, safeWarn, safeError } from "../logger";

const WHISPER_TIMEOUT_MS = 20_000;

if (typeof globalThis.File === "undefined") {
  (globalThis as any).File = NodeFile;
  safeLog("[WHISPER] installed Node File polyfill for OpenAI uploads");
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Whisper transcription timed out after ${ms}ms`);
      (err as any).code = "WHISPER_TIMEOUT";
      reject(err);
    }, ms);
    // Prevent the timer from keeping the Node process alive
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as any).unref();
    }
  });
}

export interface WhisperResult {
  ok: boolean;
  text?: string;
  error?: string;
  message?: string;
}

function classifyWhisperError(error: any): { error: string; message: string } {
  if (error?.code === "WHISPER_TIMEOUT") {
    return {
      error: "openai_timeout",
      message: "Whisper transcription timed out. Try again.",
    };
  }

  const status = error?.status;
  const code = error?.code;
  const message = error?.message || String(error);

  if (status === 401) {
    return {
      error: "openai_auth_error",
      message: "OpenAI authentication failed. Check OPENAI_API_KEY.",
    };
  }
  if (status === 429) {
    return {
      error: "openai_rate_limit",
      message: "OpenAI rate limit reached.",
    };
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
    return {
      error: "openai_network_error",
      message: "OpenAI could not be reached. Check your network.",
    };
  }

  return { error: "openai_unknown", message: `Whisper failed: ${message}` };
}

export async function transcribe(audioBuffer: Buffer): Promise<WhisperResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const primaryModel =
    process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

  safeLog("[WHISPER] received buffer", {
    bufferSize: audioBuffer?.length || 0,
  });

  if (!audioBuffer || audioBuffer.length === 0) {
    safeWarn("[WHISPER] empty audio buffer, skipping OpenAI");
    return {
      ok: false,
      error: "empty_audio",
      message: "No audio captured. Speak a little longer.",
    };
  }

  if (!OPENAI_API_KEY) {
    safeWarn("[WHISPER] OPENAI_API_KEY missing; transcription unavailable");
    return {
      ok: false,
      error: "openai_key_missing",
      message: "Whisper is not configured. Check OPENAI_API_KEY.",
    };
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const file = await toFile(audioBuffer, "audio.webm", {
    type: "audio/webm",
  });

  const tryTranscribe = async (model: string): Promise<any> => {
    safeLog(`[WHISPER] OpenAI request started with model: ${model}`);
    return await Promise.race([
      openai.audio.transcriptions.create({ file, model: model as any }),
      timeoutPromise(WHISPER_TIMEOUT_MS),
    ]);
  };

  try {
    const response = await tryTranscribe(primaryModel);
    safeLog("[WHISPER] transcription success", {
      model: primaryModel,
      textLength: response.text?.length || 0,
    });
    return { ok: true, text: response.text || "" };
  } catch (error: any) {
    safeWarn(
      `[WHISPER] primary model (${primaryModel}) failed, trying fallback whisper-1`,
      { error: error?.message },
    );

    try {
      const response = await tryTranscribe("whisper-1");
      safeLog("[WHISPER] transcription success with fallback", {
        model: "whisper-1",
        textLength: response.text?.length || 0,
      });
      return { ok: true, text: response.text || "" };
    } catch (fallbackError: any) {
      const classified = classifyWhisperError(fallbackError);
      safeError("[WHISPER] transcription failed completely", {
        code: classified.error,
        message: classified.message,
      });
      return { ok: false, ...classified };
    }
  }
}
