import { safeLog, safeWarn, safeError } from "../logger";

const TRANSCRIBE_TIMEOUT_MS = 20_000;
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface WhisperResult {
  ok: boolean;
  text?: string;
  error?: string;
  message?: string;
}

function classifyTranscribeError(error: any): { error: string; message: string } {
  if (error?.code === "WHISPER_TIMEOUT") {
    return {
      error: "gemini_timeout",
      message: "Voice transcription timed out. Try again.",
    };
  }

  const status = error?.status;
  const code = error?.code;
  const message = error?.message || String(error);

  if (status === 400 || status === 401 || status === 403) {
    return {
      error: "gemini_auth_error",
      message: "Gemini authentication failed. Check GEMINI_API_KEY.",
    };
  }
  if (status === 429) {
    return {
      error: "gemini_rate_limit",
      message: "Gemini rate limit reached.",
    };
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
    return {
      error: "gemini_network_error",
      message: "Gemini could not be reached. Check your network.",
    };
  }

  return { error: "gemini_unknown", message: `Transcription failed: ${message}` };
}

async function requestTranscription(
  model: string,
  apiKey: string,
  base64Audio: string,
): Promise<string> {
  safeLog(`[WHISPER] Gemini request started with model: ${model}`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    const err = new Error(
      `Gemini transcription timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`,
    );
    (err as any).code = "WHISPER_TIMEOUT";
    controller.abort(err);
  }, TRANSCRIBE_TIMEOUT_MS);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as any).unref();
  }

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe the spoken words in this audio clip verbatim. Return only the transcription text, with no commentary, labels, or quotation marks. If there is no intelligible speech, return an empty string.",
                },
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const err: any = new Error(
        `Gemini HTTP ${response.status}: ${bodyText.slice(0, 200)}`,
      );
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    if (data?.promptFeedback?.blockReason) {
      throw new Error(
        `Gemini blocked the request: ${data.promptFeedback.blockReason}`,
      );
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .join("")
          .trim()
      : "";
    return text;
  } catch (error: any) {
    // AbortController surfaces the timeout as an AbortError; restore our code.
    if (error?.name === "AbortError") {
      const reason = (controller.signal as any)?.reason;
      if (reason?.code === "WHISPER_TIMEOUT") throw reason;
      const err: any = new Error("Gemini transcription aborted");
      err.code = "WHISPER_TIMEOUT";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribe(audioBuffer: Buffer): Promise<WhisperResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const primaryModel =
    process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.5-flash";
  // gemini-2.0-flash is retired (generateContent returns 404), so it can
  // never back up the primary. flash-lite is current and audio-capable.
  const fallbackModel =
    process.env.GEMINI_TRANSCRIBE_FALLBACK_MODEL || "gemini-2.5-flash-lite";

  safeLog("[WHISPER] received buffer", {
    bufferSize: audioBuffer?.length || 0,
  });

  if (!audioBuffer || audioBuffer.length === 0) {
    safeWarn("[WHISPER] empty audio buffer, skipping Gemini");
    return {
      ok: false,
      error: "empty_audio",
      message: "No audio captured. Speak a little longer.",
    };
  }

  if (!GEMINI_API_KEY) {
    safeWarn("[WHISPER] GEMINI_API_KEY missing; transcription unavailable");
    return {
      ok: false,
      error: "gemini_key_missing",
      message: "Voice input is not configured. Check GEMINI_API_KEY.",
    };
  }

  const base64Audio = audioBuffer.toString("base64");

  try {
    const text = await requestTranscription(
      primaryModel,
      GEMINI_API_KEY,
      base64Audio,
    );
    safeLog("[WHISPER] transcription success", {
      model: primaryModel,
      textLength: text.length,
    });
    return { ok: true, text };
  } catch (error: any) {
    safeWarn(
      `[WHISPER] primary model (${primaryModel}) failed, trying fallback ${fallbackModel}`,
      { error: error?.message },
    );

    try {
      const text = await requestTranscription(
        fallbackModel,
        GEMINI_API_KEY,
        base64Audio,
      );
      safeLog("[WHISPER] transcription success with fallback", {
        model: fallbackModel,
        textLength: text.length,
      });
      return { ok: true, text };
    } catch (fallbackError: any) {
      const classified = classifyTranscribeError(fallbackError);
      safeError("[WHISPER] transcription failed completely", {
        code: classified.error,
        message: classified.message,
      });
      return { ok: false, ...classified };
    }
  }
}
