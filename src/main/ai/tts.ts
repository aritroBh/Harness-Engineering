import { spawn, ChildProcess } from "child_process";
import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { shell } from "electron";
import { safeLog, safeWarn, safeError } from "../logger";

// Specter speaks with ONE consistent feminine voice across all providers:
// ElevenLabs "Rachel", Gemini "Kore", macOS "Samantha". Previously the
// primary voice was masculine ("Brian") while every fallback was feminine,
// so any provider hiccup made the voice flip back and forth mid-session.
const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
// Keep fallback snappy — a 20s stall per sentence felt like a different
// app. If a provider can't answer in 8s, the next one takes over.
const PROVIDER_TIMEOUT_MS = 8_000;

// Sticky provider selection: when a provider fails, bench it for a while
// instead of retrying it on every sentence. This is what keeps the voice
// from alternating — after one ElevenLabs failure, Gemini (same feminine
// register) handles the whole conversation until the bench expires.
const PROVIDER_BENCH_MS = 10 * 60 * 1000;
const providerBenchedUntil: Record<"elevenlabs" | "gemini", number> = {
  elevenlabs: 0,
  gemini: 0,
};

function providerAvailable(provider: "elevenlabs" | "gemini"): boolean {
  return Date.now() >= providerBenchedUntil[provider];
}

function benchProvider(provider: "elevenlabs" | "gemini"): void {
  providerBenchedUntil[provider] = Date.now() + PROVIDER_BENCH_MS;
  safeWarn("[TTS] provider benched to keep one consistent voice", {
    provider,
    benchMinutes: PROVIDER_BENCH_MS / 60_000,
  });
}

/** Test hook. */
export function __resetTtsProviderBenchForTests(): void {
  providerBenchedUntil.elevenlabs = 0;
  providerBenchedUntil.gemini = 0;
}

let activePlayback: ChildProcess | null = null;
let activeRequest: AbortController | null = null;

function waitForProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code && code !== 0) {
        safeWarn("[TTS] playback process exited non-zero", { code });
      }
      resolve();
    });
  });
}

async function playAudioFile(filePath: string): Promise<void> {
  if (process.platform === "darwin") {
    activePlayback = spawn("afplay", [filePath], { stdio: "ignore" });
    const child = activePlayback;
    try {
      await waitForProcess(child);
    } finally {
      if (activePlayback === child) {
        activePlayback = null;
      }
      unlink(filePath).catch(() => undefined);
    }
    return;
  }
  await shell.openPath(filePath);
}

export async function stopSpeaking(): Promise<void> {
  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }
  if (activePlayback) {
    activePlayback.kill();
    activePlayback = null;
  }
}

async function speakFallback(text: string, reason?: string): Promise<void> {
  await stopSpeaking();
  if (!text.trim()) return;

  safeLog(`[TTS] using macOS fallback ${reason ? `(${reason})` : ""}`);
  activePlayback = spawn("say", ["-v", "Samantha", text], { stdio: "ignore" });
  const child = activePlayback;
  try {
    await waitForProcess(child);
  } finally {
    if (activePlayback === child) {
      activePlayback = null;
    }
  }
}

// Gemini TTS returns raw 16-bit signed little-endian PCM (mono, 24kHz by
// default). afplay/most players need a container, so wrap it in a WAV header.
function pcmToWav(
  pcm: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Gemini reports the sample rate in the inline audio MIME type, e.g.
// "audio/L16;codec=pcm;rate=24000". Parse it so playback pitch stays correct.
function sampleRateFromMime(mime: string | undefined): number {
  const match = /rate=(\d+)/.exec(mime || "");
  return match ? parseInt(match[1], 10) : 24000;
}

async function speakGemini(
  text: string,
  apiKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voice = process.env.GEMINI_TTS_VOICE || "Kore";

  safeLog("[TTS] Trying Gemini TTS...", { model, voice });

  const controller = new AbortController();
  activeRequest = controller;
  const timeoutId = setTimeout(() => {
    safeWarn("[TTS] Gemini TTS timed out");
    controller.abort();
  }, PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      },
    );

    clearTimeout(timeoutId);
    if (activeRequest === controller) activeRequest = null;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        reason: `HTTP ${response.status}: ${errorText.slice(0, 120)}`,
      };
    }

    const data: any = await response.json();
    const part = data?.candidates?.[0]?.content?.parts?.find(
      (p: any) => p?.inlineData?.data,
    );
    const base64 = part?.inlineData?.data;
    if (!base64) {
      return { ok: false, reason: "Empty audio response" };
    }

    const pcm = Buffer.from(base64, "base64");
    const sampleRate = sampleRateFromMime(part?.inlineData?.mimeType);
    const wav = pcmToWav(pcm, sampleRate);

    const outputDir = join(tmpdir(), "specter-tts");
    const outputPath = join(outputDir, `gemini-speech-${Date.now()}.wav`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, wav);

    safeLog("[TTS] Gemini TTS success, playing...", { bytes: wav.length });
    await playAudioFile(outputPath);
    return { ok: true };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (activeRequest === controller) activeRequest = null;
    const isAbort =
      error?.name === "AbortError" ||
      error?.message?.includes("aborted") ||
      error?.message?.includes("timed out");
    safeError("[TTS] Gemini TTS failed", error);
    return {
      ok: false,
      reason: isAbort
        ? `Gemini TTS timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`
        : error?.message || String(error),
    };
  }
}

export interface SpeakResult {
  success: boolean;
  providerUsed: "elevenlabs" | "gemini" | "macos";
  fallbackReason?: string;
  failures?: {
    elevenlabs?: string;
    gemini?: string;
  };
}

async function speakElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const controller = new AbortController();
  activeRequest = controller;

  const timeoutId = setTimeout(() => {
    safeWarn("[TTS] ElevenLabs timed out");
    controller.abort();
  }, PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          output_format: "mp3_44100_128",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      },
    );

    clearTimeout(timeoutId);
    if (activeRequest === controller) activeRequest = null;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        reason: `HTTP ${response.status}: ${errorText.slice(0, 120)}`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength) {
      return { ok: false, reason: "Empty audio response" };
    }

    const outputDir = join(tmpdir(), "specter-tts");
    const outputPath = join(outputDir, `elevenlabs-speech-${Date.now()}.mp3`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, buffer);

    safeLog("[TTS] ElevenLabs success, playing...", { bytes: buffer.length });
    await playAudioFile(outputPath);
    return { ok: true };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (activeRequest === controller) activeRequest = null;
    const isAbort =
      error?.name === "AbortError" ||
      error?.message?.includes("aborted") ||
      error?.message?.includes("timed out");
    return {
      ok: false,
      reason: isAbort ? "Aborted" : error?.message || String(error),
    };
  }
}

export async function speak(text: string): Promise<SpeakResult> {
  safeLog("[TTS] speak called", { preview: text?.slice(0, 50) });
  await stopSpeaking();
  if (!text.trim()) return { success: true, providerUsed: "macos" };

  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  const failures: { elevenlabs?: string; gemini?: string } = {};

  // 1. Try ElevenLabs (skipped while benched after a recent failure)
  if (elevenlabsKey && providerAvailable("elevenlabs")) {
    safeLog("[TTS] Calling ElevenLabs...", { voiceId, modelId });
    const result = await speakElevenLabs(text, elevenlabsKey, voiceId, modelId);
    if (result.ok) return { success: true, providerUsed: "elevenlabs" };
    safeWarn("[TTS] ElevenLabs failed", { reason: result.reason });
    failures.elevenlabs = result.reason;
    benchProvider("elevenlabs");
  }

  // 2. Try Gemini TTS Fallback (skipped while benched)
  if (geminiKey && providerAvailable("gemini")) {
    safeLog("[TTS] ElevenLabs failed or skipped; trying Gemini TTS fallback");
    const result = await speakGemini(text, geminiKey);
    if (result.ok) return { success: true, providerUsed: "gemini", failures };
    failures.gemini = result.reason;
    benchProvider("gemini");
  }

  // 3. Last resort: macOS say
  const fallbackReason =
    failures.elevenlabs || failures.gemini || "all providers skipped";
  safeLog("[TTS] ElevenLabs and Gemini failed; using macOS fallback");
  await speakFallback(text, fallbackReason);
  return { success: true, providerUsed: "macos", fallbackReason, failures };
}
