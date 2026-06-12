import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { transcribe } from "../ai/whisper";
import { safeLog, safeWarn } from "../logger";
import { recordVoiceTranscript } from "./contextTracker";

let ambientWindow: BrowserWindow | null = null;
let handlersRegistered = false;

function isAmbientEnabled(): boolean {
  return process.env.SPECTER_AMBIENT_AUDIO === "true";
}

function ambientHtmlPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "ambient-listener.html");
  }
  return join(__dirname, "../../resources/ambient-listener.html");
}

function registerAmbientHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("ambient:audio-chunk", async (_event, audioData) => {
    if (!isAmbientEnabled()) return { ok: false, skipped: true };

    const buffer = Buffer.isBuffer(audioData)
      ? audioData
      : audioData instanceof ArrayBuffer
        ? Buffer.from(audioData)
        : Buffer.from(audioData?.data || []);

    if (buffer.length < 1_000) {
      return { ok: false, skipped: true };
    }

    const result = await transcribe(buffer);
    if (result?.ok && typeof result.text === "string" && result.text.trim()) {
      recordVoiceTranscript(result.text);
      safeLog("[AMBIENT] transcript captured", {
        preview: result.text.slice(0, 80),
      });
      return { ok: true, text: result.text };
    }
    return result;
  });
}

export function startAmbientAudioListener(): void {
  if (!isAmbientEnabled()) {
    safeLog("[AMBIENT] disabled (set SPECTER_AMBIENT_AUDIO=true to enable)");
    return;
  }
  if (ambientWindow && !ambientWindow.isDestroyed()) return;

  registerAmbientHandlers();

  ambientWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/ambient.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ambientWindow.on("closed", () => {
    ambientWindow = null;
  });

  void ambientWindow.loadFile(ambientHtmlPath()).catch((error) => {
    safeWarn("[AMBIENT] failed to load listener window", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  safeLog("[AMBIENT] background listener started");
}

export function stopAmbientAudioListener(): void {
  if (ambientWindow && !ambientWindow.isDestroyed()) {
    ambientWindow.destroy();
  }
  ambientWindow = null;
}
