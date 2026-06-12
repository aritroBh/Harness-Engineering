import dotenv from "dotenv";
dotenv.config({ override: true });
import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
} from "electron";
import type { Display, Rectangle } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { uIOhook, UiohookKey } from "uiohook-napi";

import {
  checkPermissions,
  isPermissionError,
  getPermissionStatus,
} from "./permissions";
import { axEventWatcher } from "./context/axEventWatcher";
import { registerDashboardIpc, showDashboardWindow } from "./dashboard";
import { captureScreenBase64 } from "./capture";
import { clickRealMouse, executeRealMouseSteps, moveRealMouse } from "./cursor";
import {
  getCoordinateCalibrationDiagnostics,
  getMousePercent,
  getMousePosition,
  waitForMouseAtTarget,
} from "./userCursor";
import {
  analyzeScreen,
  detectScreenTargets,
  detectScreenTargetsViaAx,
  fallbackScreenState,
  fallbackScreenTargets,
} from "./ai/screener";
import { planSteps, converse, ultraConverse } from "./ai/planner";
import {
  startSession,
  getCurrentStep,
  setBrainEventEmitter,
} from "./session/tutorSession";
import { startVerification } from "./session/verificationLoop";
import { seedDemoProfile, getProfile } from "./session/skillProfileStore";
import { getPeekabooStatus } from "./automation/peekabooAdapter";
import {
  enterSplitScreen,
  restoreSplitScreen,
  SPLIT_RAIL_WIDTH,
} from "./automation/splitScreen";
import { speak, stopSpeaking } from "./ai/tts";
import { transcribe } from "./ai/whisper";
import { checkAIHealth } from "./ai/health";
import { compileEpicNotesToHtml } from "./agent/noteHtmlAgent";
import { selectArm, recordReward, getCurrentStyle } from "./ai/bandit";
import { loadGraph, saveGraph } from "./session/storage";
import {
  markNodeComplete,
  createBranch,
  getAvailableNodes,
  getNextRecommendedNode,
  getResumePrompt,
} from "./session/graph";
import {
  startRecording,
  recordStep,
  stopRecording,
  saveToNode,
} from "./session/recorder";
import { registerReplayIpc, replayWalkthrough } from "./session/replay";
import { registerClinicalIpc } from "./clinical/ipc";
import { hasActiveReplay, stopReplay } from "./session/replayController";
import { mirrorReplayExecute } from "./session/mirrorReplay";
import {
  CONTROLLED_DEMO_HEIGHT,
  CONTROLLED_DEMO_WIDTH,
  createControlledDemoWorkflow,
} from "./session/demoWorkflow";
import {
  mapPercentToScreen,
  normalizeCapturedTargetToViewportPercent,
  setActiveCoordinateDisplay,
} from "./screenCoordinates";
import type {
  BehavioralCheckpoint,
  BehavioralState,
  LearningGraph,
  Step,
} from "./session/types";
import {
  blendBehavioralStates,
  createDefaultBehavioralState,
  diffBehavioralCheckpoints,
  normalizeBehavioralState,
} from "./behavioral/model";
import {
  createCheckpointFromCurrentGraph,
  getBehavioralFrameRate,
  getBufferedBehavioralFrameCount,
  getCurrentBehavioralState,
  recordAppSwitchFrame,
  recordBehavioralFrame,
  recordBehavioralFeedback,
  seedDemoCheckpoints,
  setBehavioralStateEmitter,
  setForegroundAppProvider,
  startBehavioralTracking,
  stopBehavioralTracking,
} from "./behavioral/tracker";
import { safeLog, safeWarn, safeError } from "./logger";
import { probeOpenaraOnStartup } from "./openara";
import {
  ensureAxDumpReady,
  getAxDumpStatus,
  getFrontmostApp,
  preferredAppIdentifier,
  type FrontmostApp,
} from "./axDump";
import { looksLikeSpecterSelf } from "./ai/screener";
import {
  requestAutomationSession,
  confirmAutomationSession,
  validateAutomationAction,
  cancelAutomationSession,
} from "./security/automationGate";
import { validateSender } from "./security/ipcGuards";

import {
  DEFAULT_WIKI_ROOT,
  postToMemoryService,
  startMemorySidecar,
} from "./memorySidecar";
import {
  getContextHistory,
  getLatestContextSnapshot,
  recordVoiceTranscript,
  refreshContextNow,
  startContextTracking,
  stopContextTracking,
} from "./context/contextTracker";
import { buildProactivePrediction } from "./context/proactivePrediction";
import {
  listVisibleAxLabels,
  resolveLiveTarget,
  setLiveTargetExternalAppFallback,
} from "./automation/liveTargetResolver";
import {
  startAmbientAudioListener,
  stopAmbientAudioListener,
} from "./context/ambientAudio";
import { getForegroundAppLabel } from "./context/contextTracker";

const icon = join(__dirname, "../../resources/icon.png");
const DEFAULT_APP_NAME = "Specter";
app.setName(DEFAULT_APP_NAME);
const REAL_APP_CONFIDENCE_THRESHOLD = 0.65;

function isBrokenPipeError(error: unknown): boolean {
  if (!error) return false;
  const isEpipeCode =
    typeof error === "object" &&
    "code" in error &&
    (error as any).code === "EPIPE";
  const isEpipeMessage =
    error instanceof Error && error.message.includes("EPIPE");
  return isEpipeCode || isEpipeMessage;
}

process.stdout?.on?.("error", (error) => {
  if (isBrokenPipeError(error)) return;
});

process.stderr?.on?.("error", (error) => {
  if (isBrokenPipeError(error)) return;
});

const defaultUncaughtException = process.listeners("uncaughtException");
process.removeAllListeners("uncaughtException");

process.on("uncaughtException", (error, origin) => {
  if (isBrokenPipeError(error)) {
    return;
  }
  defaultUncaughtException.forEach((handler) => handler(error, origin));
  if (defaultUncaughtException.length === 0) {
    console.error("Uncaught Exception:", error);
    process.exit(1);
  }
});

import { ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let clinicalWindow: BrowserWindow | null = null;
let memorySidecarProcess: ChildProcess | null = null;

// Cache of the user's foreground app captured *before* the overlay shows.
// This is what the AX path uses to walk the right tree — without it,
// NSWorkspace.frontmostApplication returns Specter itself and ghost-cursor
// targeting silently falls back to vision (which mis-positions the cursor on
// non-browser apps).
interface CachedForegroundApp {
  app: FrontmostApp;
  capturedAt: number;
}

let cachedForegroundApp: CachedForegroundApp | null = null;
let foregroundProbeInflight: Promise<FrontmostApp | null> | null = null;
const FOREGROUND_CACHE_TTL_MS = 30_000;

async function captureForegroundAppNow(
  reason: string,
): Promise<FrontmostApp | null> {
  if (foregroundProbeInflight) return foregroundProbeInflight;
  foregroundProbeInflight = (async () => {
    const probed = await getFrontmostApp().catch((err) => {
      safeWarn("[FOREGROUND_APP] probe threw", {
        reason,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (probed && !looksLikeSpecterSelf(preferredAppIdentifier(probed) ?? "")) {
      cachedForegroundApp = { app: probed, capturedAt: Date.now() };
      safeLog("[FOREGROUND_APP] captured external foreground app", {
        reason,
        bundleId: probed.bundleId,
        name: probed.name,
        pid: probed.pid,
      });
    } else if (probed) {
      // Probed but it's Specter — keep whatever we had cached. Better to use a
      // slightly stale identifier of the user's last real app than to walk
      // Specter's empty overlay.
      safeLog(
        "[FOREGROUND_APP] probe returned Specter-self; keeping prior cache",
        {
          probed,
          hasCache: cachedForegroundApp !== null,
        },
      );
    }
    return probed;
  })();
  try {
    return await foregroundProbeInflight;
  } finally {
    foregroundProbeInflight = null;
  }
}

function getCachedForegroundAppIdentifier(): string | null {
  if (!cachedForegroundApp) return null;
  if (Date.now() - cachedForegroundApp.capturedAt > FOREGROUND_CACHE_TTL_MS) {
    return null;
  }
  const id = preferredAppIdentifier(cachedForegroundApp.app);
  if (!id) return null;
  if (looksLikeSpecterSelf(id)) return null;
  return id;
}

// Conversational live-ghost targeting must walk the user's real app, not
// Specter's own overlay (frontmost while the chat HUD has focus).
setLiveTargetExternalAppFallback(getCachedForegroundAppIdentifier);

function createClinicalWindow(): BrowserWindow {
  if (clinicalWindow && !clinicalWindow.isDestroyed()) return clinicalWindow;
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Specter Clinical",
    autoHideMenuBar: true,
    backgroundColor: "#0b0d10",
    webPreferences: {
      preload: join(__dirname, "../preload/clinical.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("closed", () => {
    if (clinicalWindow === win) clinicalWindow = null;
  });
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/clinical.html`);
  } else {
    win.loadFile(join(__dirname, "../renderer/clinical.html"));
  }
  clinicalWindow = win;
  return win;
}

function showClinicalWindow(): void {
  const win = createClinicalWindow();
  win.show();
  win.focus();
}

function bufferFromAudioData(audioData: any): Buffer {
  if (!audioData) return Buffer.alloc(0);
  if (Buffer.isBuffer(audioData)) return audioData;
  if (audioData instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(audioData));
  }
  if (ArrayBuffer.isView(audioData)) {
    return Buffer.from(
      audioData.buffer,
      audioData.byteOffset,
      audioData.byteLength,
    );
  }
  return Buffer.from(audioData);
}

function byteLengthOfAudioData(audioData: any): number {
  if (!audioData) return 0;
  if (typeof audioData.byteLength === "number") return audioData.byteLength;
  if (typeof audioData.length === "number") return audioData.length;
  return 0;
}

function displaySummary(display: Display): {
  id: number;
  scaleFactor: number;
  bounds: Rectangle;
  workArea: Rectangle;
} {
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    workArea: display.workArea,
  };
}

function getSummonDisplay(): { cursorPoint: Electron.Point; display: Display } {
  safeLog("[WINDOW_ROUTING] overlay summon request");
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  safeLog("[WINDOW_ROUTING] cursor point", cursorPoint);
  safeLog(
    "[WINDOW_ROUTING] selected display id / bounds",
    displaySummary(display),
  );
  setActiveCoordinateDisplay(display.id);

  return { cursorPoint, display };
}

function enableOverlayWorkspaceBehavior(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.setAlwaysOnTop(true, "screen-saver", 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.platform === "darwin") {
    // Electron does not expose AppKit collectionBehavior directly. The
    // combination of a panel window, all-workspaces visibility, screen-saver
    // z-level, and non-fullscreenable behavior is the safest available route
    // for macOS Spaces and fullscreen auxiliary presentation.
    overlayWindow.setFullScreenable(false);
  }

  safeLog("[WINDOW_ROUTING] visible on all workspaces enabled", {
    displayId: screen.getDisplayMatching(overlayWindow.getBounds()).id,
    platform: process.platform,
  });
}

function moveOverlayToDisplay(display: Display): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.setBounds(display.bounds);
  enableOverlayWorkspaceBehavior();
  safeLog("[WINDOW_ROUTING] moved overlay to display", displaySummary(display));

  const actual = overlayWindow.getBounds();
  const expected = display.bounds;
  if (
    actual.x !== expected.x ||
    actual.y !== expected.y ||
    actual.width !== expected.width ||
    actual.height !== expected.height
  ) {
    safeError(
      "[WINDOW_ROUTING] overlay bounds constrained by OS — ghost coordinates will be offset",
      { expected, actual },
    );
  }
}

function centerContentBounds(
  display: Display,
  width: number,
  height: number,
): Rectangle {
  const workArea = display.workArea;
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function movePracticeWindowToDisplay(
  display: Display,
  showWindow: boolean,
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.setContentBounds(
    centerContentBounds(display, CONTROLLED_DEMO_WIDTH, CONTROLLED_DEMO_HEIGHT),
  );
  safeLog(
    "[WINDOW_ROUTING] moved practice window to display",
    displaySummary(display),
  );

  if (showWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function overlayIsOnDisplay(display: Display): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  return screen.getDisplayMatching(overlayWindow.getBounds()).id === display.id;
}

function routeVisibleWindowsToDisplay(display: Display): void {
  moveOverlayToDisplay(display);
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    movePracticeWindowToDisplay(display, false);
  }
}

function registerWindowRoutingListeners(): void {
  const refreshVisibleOverlayRoute = (reason: string) => {
    if (
      !overlayWindow ||
      overlayWindow.isDestroyed() ||
      !overlayWindow.isVisible()
    )
      return;

    safeLog("[WINDOW_ROUTING] refreshing visible overlay route", { reason });
    safeLog(
      "[STRESS_TEST] display topology changed while overlay was visible",
      { reason },
    );
    const { display } = getSummonDisplay();
    routeVisibleWindowsToDisplay(display);
  };

  screen.on("display-metrics-changed", () =>
    refreshVisibleOverlayRoute("display-metrics-changed"),
  );
  screen.on("display-added", () => refreshVisibleOverlayRoute("display-added"));
  screen.on("display-removed", () =>
    refreshVisibleOverlayRoute("display-removed"),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPercent(value: any, fallback = 50): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;
}

function confidenceValue(value: any, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}

function realAppAction(value: any): Step["action"] {
  return ["click", "type", "scroll", "wait"].includes(value) ? value : "click";
}

function safeLabel(value: any, fallback = "Selected target"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function instructionForTarget(label: string, action: Step["action"]): string {
  if (action === "type") return `Move to ${label}.`;
  if (action === "scroll") return `Scroll near ${label}.`;
  if (action === "wait") return `Watch ${label}.`;
  return `Click ${label}.`;
}

function createRealAppStep(target: any, source: "vision" | "manual"): Step {
  const label = safeLabel(
    target?.label,
    source === "manual" ? "Manual target" : "Selected target",
  );
  const action = realAppAction(target?.action);
  const viewportX = clampPercent(target?.viewportX ?? target?.x);
  const viewportY = clampPercent(target?.viewportY ?? target?.y);

  const axElementIndex =
    typeof target?.axElementIndex === "string" && target.axElementIndex.trim()
      ? target.axElementIndex.trim()
      : undefined;
  const axApp =
    typeof target?.axApp === "string" && target.axApp.trim()
      ? target.axApp.trim()
      : undefined;

  return {
    id:
      source === "manual"
        ? "manual-real-app-target"
        : safeLabel(target?.id, "real-app-target"),
    title: source === "manual" ? "Manual target" : label,
    instruction: instructionForTarget(label, action),
    targetLabel: label,
    action,
    x: viewportX,
    y: viewportY,
    viewportX,
    viewportY,
    coordinateFrame: "viewport",
    sourceFrame:
      target?.sourceFrame ||
      (source === "manual" ? "manual" : target?.coordinateFrame || "viewport"),
    rawTarget: target?.rawTarget,
    captureMeta: target?.captureMeta,
    axElementIndex,
    axApp,
  };
}

function realAppNodeId(input: any, label: string): string {
  const microTask = safeLabel(input?.microTask, "");
  const intent = safeLabel(input?.intent, "");
  const title = microTask || intent || `Click ${label}`;
  return `Real App Test: ${title}`.slice(0, 120);
}

function isLearningGraph(value: any): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "userId" in value &&
    "app" in value &&
    "nodes" in value &&
    "sessions" in value &&
    "banditState" in value,
  );
}

function safeSend(
  window: BrowserWindow | null | undefined,
  channel: string,
  payload?: unknown,
) {
  if (!window || window.isDestroyed()) return false;
  const contents = window.webContents;
  if (!contents || contents.isDestroyed()) return false;
  contents.send(channel, payload);
  return true;
}

function sendOverlayEvent(channel: string, payload?: any): void {
  safeSend(overlayWindow, channel, payload);
}

function sortedBehavioralCheckpoints(
  graph: LearningGraph,
  includeSynthetic = true,
): BehavioralCheckpoint[] {
  return Object.values(graph.behavioralCheckpoints || {})
    .filter((checkpoint) => includeSynthetic || checkpoint.synthetic !== true)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function behavioralCheckpointForId(
  graph: LearningGraph,
  checkpointId: any,
): BehavioralCheckpoint | null {
  const checkpoints = graph.behavioralCheckpoints || {};
  return typeof checkpointId === "string" && checkpoints[checkpointId]
    ? checkpoints[checkpointId]
    : null;
}

function newestBehavioralCheckpoint(
  graph: LearningGraph,
): BehavioralCheckpoint | null {
  const checkpoints = sortedBehavioralCheckpoints(graph, false);
  return checkpoints[checkpoints.length - 1] || null;
}

function realBehavioralFrameCount(graph: LearningGraph): number {
  const persisted = (graph.behavioralFrames || []).filter(
    (frame) => frame.synthetic !== true,
  ).length;
  return persisted + getBufferedBehavioralFrameCount();
}

function hasRealBehavioralSignature(graph: LearningGraph): boolean {
  return (
    realBehavioralFrameCount(graph) > 0 ||
    sortedBehavioralCheckpoints(graph, false).length > 0
  );
}

function realCheckpointOrNull(
  checkpoint: BehavioralCheckpoint | null,
): BehavioralCheckpoint | null {
  return checkpoint && checkpoint.synthetic !== true ? checkpoint : null;
}

function safeFeedbackArm(value: any): keyof LearningGraph["banditState"] {
  return value === "A" || value === "B" || value === "C" ? value : "C";
}

function latestStepsForNode(graph: LearningGraph, nodeId?: string): Step[] {
  const sessions = nodeId
    ? graph.sessions.filter((session) => session.nodesVisited.includes(nodeId))
    : graph.sessions.filter((session) => session.steps.length > 0);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}

function selectMirrorSignature(
  graph: LearningGraph,
  input: any,
): BehavioralState {
  if (input?.blendedSignature)
    return normalizeBehavioralState(input.blendedSignature);

  const requested = realCheckpointOrNull(
    behavioralCheckpointForId(graph, input?.checkpointId),
  );
  if (requested) return requested.signature;

  const current = realCheckpointOrNull(
    behavioralCheckpointForId(graph, graph.currentBehavioralCheckpointId),
  );
  if (current) return current.signature;

  return (
    newestBehavioralCheckpoint(graph)?.signature ||
    getCurrentBehavioralState() ||
    createDefaultBehavioralState()
  );
}

function toggleOverlay(): void {
  safeLog(
    "[TOGGLE] toggleOverlay called, isVisible:",
    overlayWindow?.isVisible(),
  );
  if (!overlayWindow) return;
  if (hasActiveReplay()) {
    safeWarn(
      "[TOGGLE] double-shift pressed during active replay; stopping replay instead of hiding the overlay",
    );
    stopReplay();
    return;
  }

  // Capture the user's current foreground app *before* showing the overlay.
  // Once `overlayWindow.showInactive()` runs, Specter is the frontmost app
  // and any later AX dump walks our own empty transparent window. The probe
  // is fire-and-forget; detection pulls from the cache when it runs.
  // The same capture drives real split-screen: the foreground app is pulled
  // out of fullscreen and resized to the left of the rail.
  if (!overlayWindow.isVisible()) {
    const { display: summonDisplay } = getSummonDisplay();
    void captureForegroundAppNow("toggleOverlay summon").then(
      async (probedApp) => {
        if (!probedApp?.pid) return;
        const identifier = preferredAppIdentifier(probedApp) ?? "";
        if (looksLikeSpecterSelf(identifier)) return;
        // The probe is async — the user may have already dismissed the
        // overlay again (double-shift spam). Don't split a screen nobody
        // asked for.
        if (!overlayWindow?.isVisible()) return;
        const result = await enterSplitScreen({
          pid: probedApp.pid,
          appName: probedApp.name,
          workArea: summonDisplay.workArea,
          railWidth: SPLIT_RAIL_WIDTH,
        });
        // Split can take >1s when leaving fullscreen; if the overlay was
        // dismissed mid-flight, put the window straight back.
        if (result.ok && !overlayWindow?.isVisible()) {
          void restoreSplitScreen();
        }
      },
    );
  }

  const { display } = getSummonDisplay();

  if (overlayWindow.isVisible()) {
    if (!overlayIsOnDisplay(display)) {
      safeLog(
        "[WINDOW_ROUTING] overlay already visible; moving to active display instead of hiding",
      );
      routeVisibleWindowsToDisplay(display);
      overlayWindow.showInactive();
      overlayWindow.moveTop();
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      return;
    }

    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog("[OVERLAY_INTERACTION] hiding overlay, enabled click-through");
      safeLog("[STRESS_TEST] overlay hidden; click-through restored");
    }
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
    // Give the user their window back exactly as it was before the summon.
    void restoreSplitScreen();
  } else {
    routeVisibleWindowsToDisplay(display);
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog(
        "[OVERLAY_INTERACTION] showing overlay, enabled click-through (ignore mouse: true)",
      );
      safeLog("[STRESS_TEST] overlay shown; duplicate window count", {
        windows: BrowserWindow.getAllWindows().length,
      });
    }
    overlayWindow.showInactive();
    overlayWindow.moveTop();
    // Voice-only overlay: stay click-through so the user's app remains fully
    // clickable after the summon. Hovering the mic or the progress rail
    // flips interactivity via forwarded mouse events — clicking the mic is
    // all the focus this UI needs.
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  // Explicit visibility state — a blind toggle event lets renderer state
  // drift out of sync whenever main shows/hides the window on its own.
  safeSend(overlayWindow, "overlay:visibility", {
    visible: overlayWindow.isVisible(),
  });
}

let lastShiftTime = 0;
let lastToggleTime = 0;
const DOUBLE_TAP_MS = 300;
const TOGGLE_COOLDOWN_MS = 300;

uIOhook.on("keydown", (e) => {
  if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) {
    const now = Date.now();
    if (now - lastShiftTime < DOUBLE_TAP_MS) {
      if (now - lastToggleTime >= TOGGLE_COOLDOWN_MS) {
        toggleOverlay();
        lastToggleTime = now;
      }
      lastShiftTime = 0;
    } else {
      lastShiftTime = now;
    }
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: CONTROLLED_DEMO_WIDTH,
    height: CONTROLLED_DEMO_HEIGHT,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    safeLog(
      "[WINDOW_ROUTING] practice window ready and waiting for controlled demo",
    );
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Prevent full access from main practice window
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createOverlayWindow(): void {
  const initialDisplay = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  const { x, y, width, height } = initialDisplay.bounds;
  setActiveCoordinateDisplay(initialDisplay.id);

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    focusable: true,
    acceptFirstMouse: true,
    show: false,
    backgroundColor: "#00000000",
    // Without this, macOS constrains the window below the menu bar
    // (y=33, height shrunk to workArea). Ghost coordinates are percent of
    // display.bounds, so a constrained window paints every target ~33px off.
    enableLargerThanScreen: true,
    // 'panel' is the macOS-native overlay type: always-on-top across all
    // Spaces without entering fullscreen mode, which would break transparency
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/overlay.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  enableOverlayWorkspaceBehavior();
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on("ready-to-show", () => {
    overlayWindow?.hide();
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    overlayWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/overlay.html`,
    );
  } else {
    overlayWindow.loadFile(join(__dirname, "../renderer/overlay.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  const granted = await checkPermissions();
  if (!granted) return;

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const specterMode = process.env.SPECTER_MODE || "ghostwiki";
  safeLog("[STARTUP] Active Mode:", { mode: specterMode });

  if (specterMode === "ghostwiki") {
    safeLog("[STARTUP] Memory Service Port:", {
      port: process.env.MEMORY_SERVICE_PORT || "8765",
    });
    safeLog("[STARTUP] Wiki Root:", {
      root: process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT,
    });
    safeLog("[STARTUP] Cognee Enabled:", {
      enabled: process.env.COGNEE_ENABLED || "false",
    });
    startMemorySidecar().then((child) => {
      memorySidecarProcess = child;
    });
  }

  createWindow();
  createOverlayWindow();

  registerWindowRoutingListeners();

  const shouldOpenDevTools =
    !app.isPackaged && process.env["SPECTER_OPEN_DEVTOOLS"] === "true";

  if (shouldOpenDevTools) {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
    overlayWindow?.webContents.openDevTools({ mode: "detach" });
  }

  if (!app.isPackaged) {
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
    });
  }

  globalShortcut.register("CommandOrControl+Shift+K", () => {
    showClinicalWindow();
  });

  globalShortcut.register("CommandOrControl+Shift+M", () => {
    showDashboardWindow();
  });
  registerDashboardIpc();

  ipcMain.handle("automation:peekaboo-status", async () => {
    return await getPeekabooStatus();
  });

  ipcMain.handle("env:getStartupMode", () => {
    return process.env.SPECTER_MODE || "ghostwiki";
  });

  ipcMain.handle("clinical:window:show", async () => {
    showClinicalWindow();
    return { ok: true };
  });

  uIOhook.start();
  void probeOpenaraOnStartup();

  // Compile / locate the ax-dump helper that drives pixel-perfect AX targeting.
  // Done off the critical path; the AX detector falls back to vision if this
  // returns null.
  setImmediate(() => {
    const path = ensureAxDumpReady();
    safeLog("[AX_DUMP] startup probe", {
      ready: path !== null,
      status: getAxDumpStatus(),
    });
  });

  setBehavioralStateEmitter((state) => {
    sendOverlayEvent("spec:state", state);
    sendOverlayEvent("spec:mood", state.moodLabel);
  });
  startBehavioralTracking();
  setForegroundAppProvider(() => getForegroundAppLabel());
  startContextTracking();
  startAmbientAudioListener();
  setTimeout(() => {
    const { realFrames, trackingMs } = getBehavioralFrameRate();
    if (trackingMs > 8000 && realFrames < 3) {
      safeWarn(
        "[BEHAVIOR] No real frames after 12s - uiohook likely blocked by macOS permissions",
      );
      sendOverlayEvent("spec:mood", "stuck");
      sendOverlayEvent("behavior:permissions-warning", {
        message:
          "Specter needs Accessibility + Input Monitoring permissions. Grant them in System Settings -> Privacy & Security, then restart.",
      });
    }
  }, 12000);

  app.on("browser-window-blur", (_event, window) => {
    recordAppSwitchFrame(
      window === overlayWindow ? "overlay blur" : "window blur",
    );
  });

  app.on("browser-window-focus", (_event, window) => {
    recordAppSwitchFrame(
      window === overlayWindow ? "overlay focus" : "window focus",
    );
  });

  app.on("before-quit", () => {
    stopBehavioralTracking();
    stopContextTracking();
    stopAmbientAudioListener();
    setForegroundAppProvider(null);
    setBehavioralStateEmitter(null);
    // Best-effort: never leave the user's window stuck at half size.
    void restoreSplitScreen();
  });

  // IPC Handlers
  ipcMain.on("overlay:hide", () => {
    if (!overlayWindow) return;
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
    safeSend(overlayWindow, "overlay:visibility", { visible: false });
    void restoreSplitScreen();
  });

  // Security Gate
  ipcMain.handle("automation:request", async (event, mode, steps) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    return requestAutomationSession(mode, steps);
  });
  ipcMain.handle("automation:confirm", async (event, token) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    return confirmAutomationSession(token);
  });
  ipcMain.handle("automation:cancel", async (event) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    cancelAutomationSession();
  });

  ipcMain.handle(
    "cursor:move",
    async (event, x, y, durationMs, expectedDisplayId) => {
      if (!validateSender(event, overlayWindow))
        throw new Error("Unauthorized sender");
      if (!validateAutomationAction("cursor:move"))
        throw new Error("Automation blocked by gate");
      safeLog("[IPC] cursor:move", { x, y, durationMs, expectedDisplayId });
      return moveRealMouse(x, y, durationMs, expectedDisplayId);
    },
  );

  ipcMain.handle("cursor:click", async (event, x, y, expectedDisplayId) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    if (!validateAutomationAction("cursor:click"))
      throw new Error("Automation blocked by gate");
    return clickRealMouse(x, y, undefined, expectedDisplayId);
  });

  ipcMain.handle("cursor:replay", async (event, steps) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    if (!validateAutomationAction("cursor:replay", steps?.length || 1))
      throw new Error("Automation blocked by gate");
    safeWarn(
      "[AUTO_REAL_MOUSE] LOUD WARNING: REAL OS automation steps triggered from IPC",
      { count: steps?.length },
    );
    return executeRealMouseSteps(steps);
  });

  ipcMain.handle("cursor:getPosition", async () => getMousePosition());
  ipcMain.handle("cursor:getPositionPercent", async () => getMousePercent());
  ipcMain.handle("cursor:diagnostics", async () =>
    getCoordinateCalibrationDiagnostics(),
  );

  ipcMain.handle("coordinate:mapPercentToScreen", async (_event, input) => {
    const x = clampPercent(input?.x);
    const y = clampPercent(input?.y);
    const mapping = await mapPercentToScreen(x, y);
    safeLog("[COORD_ALIGNMENT] mapPercentToScreen", mapping);
    return mapping;
  });

  ipcMain.handle("cursor:moveCenter", async (event) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    if (!validateAutomationAction("cursor:moveCenter"))
      throw new Error("Automation blocked by gate");
    safeLog("[COORD_CALIBRATION] explicit center move requested");
    return moveRealMouse(50, 50);
  });

  ipcMain.handle(
    "cursor:waitForTarget",
    async (_event, x, y, tolerancePx = 50, timeoutMs = 12000) => {
      safeLog("[IPC] cursor:waitForTarget", { x, y, tolerancePx, timeoutMs });
      return waitForMouseAtTarget(x, y, tolerancePx, timeoutMs);
    },
  );

  ipcMain.handle("overlay:setClickThrough", async (_event, clickThrough) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog(
        `[OVERLAY_INTERACTION] ${clickThrough ? "enabled click-through" : "enabled interactive zone"}`,
      );
    }
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  });

  ipcMain.handle("screen:capture", async (event) => {
    safeLog("[IPC] screen:capture");
    try {
      return await captureScreenBase64();
    } catch (err: any) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        if (!event.sender.isDestroyed()) {
          event.sender.send("permissions:screen-denied");
        }
      }
      throw err;
    }
  });

  ipcMain.handle("screen:analyze", async (event, base64PNG, options) => {
    safeLog("[IPC] screen:analyze", {
      hasBase64: !!base64PNG,
      captureUnderlying: !!options?.captureUnderlying,
    });
    const captureUnderlying = options?.captureUnderlying;
    const logPrefix = captureUnderlying
      ? "[CAPTURE_UNDERLYING]"
      : "[CAPTURE_SCREEN]";
    const wasOverlayVisible =
      captureUnderlying &&
      Boolean(
        overlayWindow &&
        !overlayWindow.isDestroyed() &&
        overlayWindow.isVisible(),
      );
    try {
      if (wasOverlayVisible && overlayWindow) {
        safeLog("[CAPTURE_UNDERLYING] hiding overlay before screen capture");
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.hide();
        await delay(160);
      }
      safeLog(`${logPrefix} starting screenshot capture`);
      const screenshotResult = base64PNG
        ? { base64: base64PNG, width: 0, height: 0 }
        : await captureScreenBase64();
      safeLog(`${logPrefix} screenshot captured`, {
        bytesBase64: screenshotResult.base64.length,
      });
      const result = await analyzeScreen(
        screenshotResult.base64,
        screenshotResult.width,
        screenshotResult.height,
      );
      recordBehavioralFrame({
        t: Date.now(),
        dwellMs: 0,
        actionType: "scan",
        revisionSignal: 0,
        app: typeof result?.app === "string" ? result.app : "screen",
        targetLabel: "real screenshot/VLM state",
      });
      return result;
    } catch (err: any) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        if (!event.sender.isDestroyed()) {
          event.sender.send("permissions:screen-denied");
        }
      }
      safeError(
        "[Specter] Screen analysis failed; using fallback screen state:",
        err,
      );
      return fallbackScreenState();
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        safeLog(
          "[CAPTURE_UNDERLYING] restoring overlay after capture, click-through true",
        );
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });

  ipcMain.handle("realApp:detectTargets", async (event, userIntent = "") => {
    const prompt =
      typeof userIntent === "string" && userIntent.trim()
        ? userIntent.trim()
        : "Teach one visible action";
    safeLog("[REAL_APP_TEST] capture requested", { prompt });

    const wasOverlayVisible = Boolean(
      overlayWindow &&
      !overlayWindow.isDestroyed() &&
      overlayWindow.isVisible(),
    );

    try {
      if (wasOverlayVisible && overlayWindow) {
        safeLog(
          "[CAPTURE_UNDERLYING] hiding overlay before real-app target detection",
        );
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.hide();
        await delay(160);
      }

      safeLog(
        "[CAPTURE_UNDERLYING] starting screenshot capture for real-app targets",
      );
      const screenshotResult = await captureScreenBase64();
      safeLog("[CAPTURE_UNDERLYING] screenshot captured for real-app targets", {
        prompt,
        bytesBase64: screenshotResult.base64.length,
      });

      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        safeLog(
          "[CAPTURE_UNDERLYING] restoring overlay after real-app capture, click-through true",
        );
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }

      // The cache was populated when the user double-tapped Shift to summon
      // the overlay. If the cache is empty or stale (e.g. dev reload), this
      // returns null and AX falls back to "frontmost" — which the screener
      // refuses if it resolves to Specter itself.
      const cachedAppId = getCachedForegroundAppIdentifier();
      safeLog("[AX_TARGETS] using cached foreground app identifier", {
        cachedAppId: cachedAppId ?? "(none — falling back to frontmost)",
      });

      const axResult = await detectScreenTargetsViaAx(
        prompt,
        screenshotResult.base64,
        screenshotResult.width,
        screenshotResult.height,
        cachedAppId ?? undefined,
      ).catch((err) => {
        safeWarn("[AX_TARGETS] AX path threw; falling back to vision", {
          message: err?.message,
        });
        return null;
      });

      const result =
        axResult && axResult.targets.length > 0
          ? axResult
          : await detectScreenTargets(
              screenshotResult.base64,
              prompt,
              screenshotResult.width,
              screenshotResult.height,
            );

      safeLog("[REAL_APP_TEST] target source", {
        source: axResult && axResult.targets.length > 0 ? "ax" : "vision",
        count: result.targets.length,
      });
      const normalizedTargets = result.targets.map((target, index) => {
        safeLog("[COORD_FRAME] raw target", {
          index,
          label: target.label,
          sourceFrame:
            target.sourceFrame || target.coordinateFrame || "capture",
          raw: {
            x: target.rawTarget?.x ?? target.x,
            y: target.rawTarget?.y ?? target.y,
          },
          captureBounds: screenshotResult.meta.captureBounds,
          displayBounds: screenshotResult.meta.displayBounds,
          imageWidth: screenshotResult.meta.imageWidth,
          imageHeight: screenshotResult.meta.imageHeight,
        });
        const normalized = normalizeCapturedTargetToViewportPercent(
          target,
          screenshotResult.meta,
        );
        safeLog("[COORD_FRAME] normalized target", {
          index,
          label: normalized.label,
          sourceFrame: normalized.sourceFrame,
          rawTarget: normalized.rawTarget,
          viewport: {
            x: normalized.x,
            y: normalized.y,
            viewportX: normalized.viewportX,
            viewportY: normalized.viewportY,
          },
          captureBounds: normalized.captureMeta?.captureBounds,
          displayBounds: normalized.captureMeta?.displayBounds,
        });
        return normalized;
      });
      const normalizedResult = {
        ...result,
        targets: normalizedTargets,
        captureMeta: screenshotResult.meta,
      };
      recordBehavioralFrame({
        t: Date.now(),
        dwellMs: 0,
        actionType: "scan",
        revisionSignal: normalizedResult.targets.length > 0 ? 0 : 0.35,
        app:
          typeof normalizedResult.app === "string"
            ? normalizedResult.app
            : "screen",
        targetLabel: `VLM targets: ${normalizedResult.targets.length}`,
      });
      safeLog("[SCREEN_TARGETS] targets returned", {
        prompt,
        app: normalizedResult.app,
        count: normalizedResult.targets.length,
        threshold: REAL_APP_CONFIDENCE_THRESHOLD,
        topConfidence: normalizedResult.targets[0]?.confidence ?? null,
        screenshot: {
          width: screenshotResult.width,
          height: screenshotResult.height,
          meta: screenshotResult.meta,
        },
      });
      safeLog("[SCREEN_TARGETS] candidate list", {
        prompt,
        candidates: normalizedResult.targets.map((target, index) => ({
          index,
          label: target.label,
          description: target.description,
          x: target.x,
          y: target.y,
          viewportX: target.viewportX,
          viewportY: target.viewportY,
          rawTarget: target.rawTarget,
          sourceFrame: target.sourceFrame,
          coordinateFrame: target.coordinateFrame,
          confidence: target.confidence,
          action: target.action,
          source: target.source,
        })),
      });
      return {
        ...normalizedResult,
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD,
      };
    } catch (err: any) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        if (!event.sender.isDestroyed()) {
          event.sender.send("permissions:screen-denied");
        }
      }
      safeError("[REAL_APP_TEST] target detection failed:", err);
      return {
        ...fallbackScreenTargets(prompt),
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD,
      };
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });

  ipcMain.handle("realApp:createWorkflow", async (_event, input) => {
    const target = input && typeof input === "object" ? input.target : null;
    const mode = input?.mode === "ultra" ? "ultra" : "silent";
    safeLog("[MODE] current mode", { mode, flow: "real-app-workflow" });
    const source: "vision" | "manual" =
      target?.source === "manual" || input?.source === "manual"
        ? "manual"
        : "vision";
    const step = createRealAppStep(target, source);
    const nodeId = realAppNodeId(
      input,
      step.targetLabel || step.title || "Selected target",
    );
    const targetConfidence = confidenceValue(
      target?.confidence,
      source === "manual" ? 1 : 0,
    );

    if (source === "manual") {
      safeLog("[MANUAL_TARGET] saving manual real-app target", {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y,
      });
    } else {
      safeLog("[TARGET_CONFIRM] saving confirmed real-app target", {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y,
        confidence: targetConfidence,
      });
    }

    const graph = saveToNode(loadGraph(DEFAULT_APP_NAME), nodeId, [step]);
    saveGraph(graph);
    safeLog("[REAL_APP_WALKTHROUGH] workflow ready", {
      nodeId,
      totalSteps: 1,
      label: step.targetLabel,
      source,
      mode,
      confidence: targetConfidence,
    });
    safeLog("[REAL_APP_WALKTHROUGH] confirmed target", {
      nodeId,
      label: step.targetLabel,
      percent: {
        x: step.x,
        y: step.y,
      },
      source,
      confidence: targetConfidence,
    });

    return {
      nodeId,
      steps: [step],
      intent: safeLabel(input?.intent, step.targetLabel || "Real App Test"),
      source,
      confidence: targetConfidence,
    };
  });

  ipcMain.handle(
    "planner:plan",
    async (_event, userIntent, screenState, sessionHistory, mode) => {
      safeLog("[IPC] planner:plan", { userIntent, mode });
      return planSteps(userIntent, screenState, sessionHistory, mode);
    },
  );

  ipcMain.handle(
    "planner:converse",
    async (_event, userMessage, screenState, conversationHistory) =>
      converse(userMessage, screenState, conversationHistory),
  );

  ipcMain.handle("ultra:converse", async (_event, payload) => {
    safeLog("[ULTRA_IPC] ultra:converse received");
    const visibleAxLabels = await listVisibleAxLabels(25);
    const result = await ultraConverse({ ...payload, visibleAxLabels });

    if (result.liveTarget) {
      const resolved = await resolveLiveTarget(
        result.liveTarget.targetLabel,
        result.liveTarget.action,
      );
      if (!resolved) {
        safeWarn("[ULTRA_IPC] liveTarget not resolvable after converse", {
          targetLabel: result.liveTarget.targetLabel,
          visibleAxLabels: visibleAxLabels.slice(0, 8),
        });
        return {
          ...result,
          liveTargetUnresolved: result.liveTarget.targetLabel,
          liveTarget: undefined,
        };
      }
    }

    return result;
  });

  ipcMain.handle(
    "live:resolveTarget",
    async (event, payload: { targetLabel?: string; action?: string }) => {
      if (!validateSender(event, overlayWindow))
        throw new Error("Unauthorized sender");
      const targetLabel =
        typeof payload?.targetLabel === "string"
          ? payload.targetLabel.trim()
          : "";
      const action = payload?.action;
      if (
        !targetLabel ||
        (action !== "click" &&
          action !== "type" &&
          action !== "scroll" &&
          action !== "wait")
      ) {
        return null;
      }
      return resolveLiveTarget(targetLabel, action);
    },
  );

  ipcMain.handle("context:get", async () => ({
    ok: true,
    snapshot: getLatestContextSnapshot(),
    history: getContextHistory().slice(-10),
  }));

  ipcMain.handle("context:refresh", async () => ({
    ok: true,
    snapshot: await refreshContextNow("ipc refresh"),
  }));

  ipcMain.handle("proactive:predict", async () => buildProactivePrediction());
  // Part-A contract channels ─────────────────────────────────────────────────
  ipcMain.handle("permissions:get", () => getPermissionStatus());
  ipcMain.handle("debug:tree", () => {
    const tree = axEventWatcher.getLatestTree();
    if (!tree)
      return { ok: false, error: "no tree yet — start a session first" };
    return { ok: true, tree };
  });
  setBrainEventEmitter((event) => sendOverlayEvent("spec:event", event));
  startVerification();
  ipcMain.handle("session:start", async (_event, req) =>
    startSession(req ?? { goal: "" }),
  );
  ipcMain.handle("step:current", () => {
    const step = getCurrentStep();
    if (!step) return { ok: false, error: "no current step yet" };
    return { ok: true, step };
  });
  ipcMain.handle("profile:get", (_event, app: string) => ({
    ok: true,
    profile: getProfile(app),
  }));
  ipcMain.handle("profile:seed-demo", (_event, app?: string) => {
    seedDemoProfile(app ?? "Gmail");
    return { ok: true };
  });

  ipcMain.handle("agent:compileNoteHtml", async (event, input) => {
    if (!validateSender(event, overlayWindow))
      throw new Error("Unauthorized sender");
    if (!validateAutomationAction("agent:compileNoteHtml", 24))
      throw new Error("Automation blocked by gate");

    const intent =
      typeof input?.intent === "string" && input.intent.trim()
        ? input.intent.trim()
        : "Epic Notes is already open. Open each visible note, copy the full note content, and synthesize one HPI with the LLM.";
    const wasOverlayVisible = Boolean(
      overlayWindow &&
      !overlayWindow.isDestroyed() &&
      overlayWindow.isVisible(),
    );

    try {
      if (wasOverlayVisible && overlayWindow) {
        safeLog("[NOTE_HTML_AGENT] hiding overlay before agent run");
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.hide();
        await delay(160);
      }
      return await compileEpicNotesToHtml(intent);
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });

  ipcMain.handle("ai:healthCheck", async () => checkAIHealth());

  ipcMain.handle("session:save", async (_event, graph) => {
    if (isLearningGraph(graph)) {
      saveGraph(graph);
      return graph;
    }
    return loadGraph(DEFAULT_APP_NAME);
  });

  ipcMain.handle("session:load", async (_event, appName = DEFAULT_APP_NAME) =>
    loadGraph(appName),
  );

  ipcMain.handle("behavior:getState", async () => getCurrentBehavioralState());

  ipcMain.handle(
    "behavior:recordFrame",
    async (_event, frame, appName = DEFAULT_APP_NAME) => {
      const recorded = recordBehavioralFrame(frame);
      const graph = loadGraph(appName);
      graph.behavioralFrames = [
        ...(graph.behavioralFrames || []),
        recorded,
      ].slice(-500);
      saveGraph(graph);
      const state = getCurrentBehavioralState();
      sendOverlayEvent("spec:state", state);
      sendOverlayEvent("spec:mood", state.moodLabel);
      return { frame: recorded, state };
    },
  );

  ipcMain.handle(
    "behavior:createCheckpoint",
    async (_event, appName = DEFAULT_APP_NAME) => {
      const result = createCheckpointFromCurrentGraph(loadGraph(appName));
      saveGraph(result.graph);
      sendOverlayEvent("behavior:checkpoint-created", result.checkpoint);
      sendOverlayEvent("spec:state", result.checkpoint.signature);
      sendOverlayEvent("spec:mood", result.checkpoint.signature.moodLabel);
      return result.checkpoint;
    },
  );

  ipcMain.handle(
    "behavior:listCheckpoints",
    async (_event, appName = DEFAULT_APP_NAME) =>
      sortedBehavioralCheckpoints(loadGraph(appName)),
  );

  ipcMain.handle(
    "behavior:diffCheckpoints",
    async (_event, fromId, toId, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      const from = realCheckpointOrNull(
        behavioralCheckpointForId(graph, fromId),
      );
      const to = realCheckpointOrNull(behavioralCheckpointForId(graph, toId));
      if (!from || !to) return null;
      return diffBehavioralCheckpoints(from, to);
    },
  );

  ipcMain.handle(
    "behavior:blendCheckpoints",
    async (_event, fromId, toId, t, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      const from = realCheckpointOrNull(
        behavioralCheckpointForId(graph, fromId),
      );
      const to = realCheckpointOrNull(behavioralCheckpointForId(graph, toId));
      if (!from || !to) return null;
      const state = blendBehavioralStates(from.signature, to.signature, t);
      sendOverlayEvent("spec:state", state);
      sendOverlayEvent("spec:mood", state.moodLabel);
      return state;
    },
  );

  ipcMain.handle(
    "behavior:seedDemo",
    async (_event, appName = DEFAULT_APP_NAME) => {
      if (
        app.isPackaged &&
        process.env.SPECTER_ENABLE_DEV_FALLBACK !== "true"
      ) {
        throw new Error(
          "Synthetic demo checkpoints are a dev-only fallback and cannot be used as learned behavior.",
        );
      }
      const result = seedDemoCheckpoints(loadGraph(appName));
      saveGraph(result.graph);
      const current = result.checkpoints[result.checkpoints.length - 1];
      sendOverlayEvent("behavior:checkpoint-created", current);
      sendOverlayEvent(
        "spec:state",
        current?.signature || getCurrentBehavioralState(),
      );
      sendOverlayEvent("spec:mood", current?.signature.moodLabel || "idle");
      return sortedBehavioralCheckpoints(result.graph);
    },
  );

  ipcMain.handle(
    "behavior:feedback",
    async (_event, input = {}, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      const result = recordBehavioralFeedback(input);
      const arm = safeFeedbackArm(input?.arm);
      graph.behavioralFrames = [
        ...(graph.behavioralFrames || []),
        result.frame,
      ].slice(-500);
      graph.banditState = recordReward(graph.banditState, arm, result.reward);
      saveGraph(graph);
      const state = getCurrentBehavioralState();
      sendOverlayEvent("spec:state", state);
      sendOverlayEvent("spec:mood", state.moodLabel);
      safeLog("[BEHAVIOR] feedback recorded", {
        kind: input?.kind || "hesitation",
        reward: result.reward,
        arm,
        actionType: result.frame.actionType,
      });
      return {
        frame: result.frame,
        state,
        reward: result.reward,
        banditState: graph.banditState,
      };
    },
  );

  ipcMain.handle(
    "session:resume-prompt",
    async (_event, appName = DEFAULT_APP_NAME) =>
      getResumePrompt(loadGraph(appName)),
  );

  ipcMain.handle("session:record-start", async () => startRecording());
  ipcMain.handle("session:record-step", async (_event, step) =>
    recordStep(step),
  );
  ipcMain.handle("session:record-stop", async () => stopRecording());

  ipcMain.handle(
    "session:save-node",
    async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
      const graph = saveToNode(loadGraph(appName), nodeId, steps);
      saveGraph(graph);
      return graph;
    },
  );

  ipcMain.handle("demo:controlledWorkflow", async () => {
    const { display } = getSummonDisplay();
    moveOverlayToDisplay(display);

    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      movePracticeWindowToDisplay(display, true);
    }

    const workflow = createControlledDemoWorkflow(mainWindow);
    const graph = saveToNode(
      loadGraph(DEFAULT_APP_NAME),
      workflow.nodeId,
      workflow.steps,
    );
    saveGraph(graph);
    safeLog("[DEMO] controlled workflow prepared", {
      nodeId: workflow.nodeId,
      totalSteps: workflow.steps.length,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        action: step.action,
        x: step.x,
        y: step.y,
      })),
    });
    return workflow;
  });

  ipcMain.handle(
    "session:mark-complete",
    async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
      const graph = markNodeComplete(loadGraph(appName), nodeId);
      saveGraph(graph);
      return graph;
    },
  );

  ipcMain.handle(
    "session:create-branch",
    async (_event, fromNodeId, fromStep, appName = DEFAULT_APP_NAME) => {
      const result = createBranch(loadGraph(appName), fromNodeId, fromStep);
      saveGraph(result.graph);
      return result;
    },
  );

  ipcMain.handle(
    "session:next-node",
    async (_event, appName = DEFAULT_APP_NAME) =>
      getNextRecommendedNode(loadGraph(appName)),
  );

  ipcMain.handle(
    "session:available-nodes",
    async (_event, appName = DEFAULT_APP_NAME) =>
      getAvailableNodes(loadGraph(appName)),
  );

  ipcMain.handle("bandit:select", async (_event, appName = DEFAULT_APP_NAME) =>
    selectArm(loadGraph(appName).banditState),
  );

  ipcMain.handle(
    "bandit:reward",
    async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      graph.banditState = recordReward(graph.banditState, arm, reward);
      saveGraph(graph);
      return {
        banditState: graph.banditState,
        style: getCurrentStyle(graph.banditState),
      };
    },
  );

  ipcMain.handle("bandit:style", async (_event, appName = DEFAULT_APP_NAME) =>
    getCurrentStyle(loadGraph(appName).banditState),
  );

  ipcMain.handle(
    "bandit:selectStyle",
    async (_event, appName = DEFAULT_APP_NAME) =>
      selectArm(loadGraph(appName).banditState),
  );

  ipcMain.handle(
    "bandit:recordReward",
    async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      graph.banditState = recordReward(graph.banditState, arm, reward);
      saveGraph(graph);
      return {
        banditState: graph.banditState,
        style: getCurrentStyle(graph.banditState),
      };
    },
  );

  ipcMain.handle(
    "session:markComplete",
    async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
      const graph = markNodeComplete(loadGraph(appName), nodeId);
      saveGraph(graph);
      return graph;
    },
  );

  ipcMain.handle(
    "session:saveNode",
    async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
      const graph = saveToNode(loadGraph(appName), nodeId, steps);
      saveGraph(graph);
      return graph;
    },
  );

  ipcMain.handle(
    "session:walkthrough",
    async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
      const graph = loadGraph(appName);
      const sessions = nodeId
        ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId))
        : graph.sessions.filter((s) => s.steps.length > 0);
      const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
      const steps = latest?.steps || [];
      await replayWalkthrough(steps, () => {});
    },
  );

  ipcMain.handle(
    "mirror:run",
    async (event, input = {}, appName = DEFAULT_APP_NAME) => {
      const failMirrorRun = (message: string): never => {
        sendOverlayEvent("mirror:error", { message });
        sendOverlayEvent("spec:mood", "stuck");
        throw new Error(message);
      };

      if (!validateSender(event, overlayWindow)) {
        failMirrorRun("Mirror Mode can only be started from the overlay.");
      }

      if (input?.confirmed !== true) {
        failMirrorRun(
          "Mirror Mode requires visible renderer confirmation before real mouse automation.",
        );
      }

      const graph = loadGraph(appName);
      if (!hasRealBehavioralSignature(graph)) {
        failMirrorRun(
          "Mirror Mode needs measured behavioral frames or a real behavioral checkpoint before it can run.",
        );
      }

      const signature = selectMirrorSignature(graph, input);

      try {
        let steps = latestStepsForNode(graph, input?.nodeId);
        if (steps.length === 0) {
          steps = latestStepsForNode(graph);
        }

        if (steps.length === 0) {
          failMirrorRun(
            "Mirror Mode needs a real recorded or saved workflow. Start a real-app walkthrough or record a session first.",
          );
        }

        if (!validateAutomationAction("mirror:run", steps.length)) {
          failMirrorRun("Mirror Mode was blocked by the automation gate.");
        }

        sendOverlayEvent("mirror:started", { signature });
        sendOverlayEvent("spec:mood", "mirroring");
        await mirrorReplayExecute(steps, signature);
        sendOverlayEvent("mirror:complete", { total: steps.length });
        sendOverlayEvent("spec:mood", "celebrating");
        return { ok: true, totalSteps: steps.length, signature };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        safeError("[MIRROR_MODE] failed", error);
        sendOverlayEvent("mirror:error", { message });
        sendOverlayEvent("spec:mood", "stuck");
        throw error;
      }
    },
  );

  ipcMain.handle("tts:speak", async (_event, text) => {
    safeLog("[IPC] tts:speak", { text: text?.slice(0, 50) });
    return speak(text);
  });

  ipcMain.handle("tts:stop", async () => stopSpeaking());
  ipcMain.handle("ai:testVoiceOutput", async () => {
    safeLog("[IPC] ai:testVoiceOutput");
    return speak(
      "Specter voice test. This is a check of the natural speech system.",
    );
  });

  ipcMain.handle("whisper:transcribe", async (_event, audioData) => {
    const buffer = bufferFromAudioData(audioData);
    safeLog("[IPC] whisper:transcribe", {
      byteLength: byteLengthOfAudioData(audioData),
      convertedBufferLength: buffer.length,
    });
    const result = await transcribe(buffer);
    if (result?.ok && typeof result.text === "string" && result.text.trim()) {
      recordVoiceTranscript(result.text);
    }
    return result;
  });

  ipcMain.handle(
    "ghostwiki:ingest-current-session",
    async (_event, sessionId, appName) => {
      const { compileSessionToWiki } = require("./wiki/workflowCompiler");
      const { writeWikiPage } = require("./wiki/wikiWriter");
      const { loadGraph } = require("./session/storage");
      const { getDemoWorkflow } = require("./session/demoWorkflow");

      const graph = loadGraph(appName);
      // Use the demo workflow session explicitly if we can't find it in the graph
      const demoWorkflow = getDemoWorkflow();
      const session =
        graph.sessions.find((s: any) => s.id === sessionId) ||
        (demoWorkflow && demoWorkflow.sessions
          ? demoWorkflow.sessions.find((s: any) => s.id === sessionId)
          : null);

      if (!session) {
        // Throw explicit error if session isn't loaded/found. The fix allows the demo session to be seeded via getDemoWorkflow in loadGraph
        throw new Error(`Session ${sessionId} not found in app ${appName}`);
      }

      const pages = compileSessionToWiki(session, appName);
      const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT;

      const filepaths: string[] = [];
      for (const page of pages) {
        const path = writeWikiPage(page, wikiRoot);
        if (path) filepaths.push(path);
      }

      safeLog("[GhostWiki] Ingesting session wiki pages", {
        sessionId,
        fileCount: filepaths.length,
        wikiRoot,
      });
      const data = await postToMemoryService("/ingest", { files: filepaths });
      safeLog("[GhostWiki] Ingest complete", {
        mode: data.mode,
        sourcesIngested: data.sources_ingested,
      });
      return data;
    },
  );

  ipcMain.handle(
    "ghostwiki:query",
    async (
      _event,
      queryText,
      feedbackSourceSessionId,
      feedbackType,
      feedbackDetails,
    ) => {
      let correctionPath: string | null = null;
      if (feedbackType && feedbackDetails && feedbackSourceSessionId) {
        // It's a feedback loop
        const { compileCorrectionToWiki } = require("./wiki/workflowCompiler");
        const { writeWikiPage } = require("./wiki/wikiWriter");
        const page = compileCorrectionToWiki(
          feedbackSourceSessionId,
          feedbackType,
          feedbackDetails,
          queryText,
        );
        const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT;
        const filepath = writeWikiPage(page, wikiRoot);
        correctionPath = filepath;

        // Re-ingest
        if (filepath) {
          safeLog("[GhostWiki] Re-ingesting correction page", { filepath });
          await postToMemoryService("/ingest", { files: [filepath] });
        }
      }

      safeLog("[GhostWiki] Query", { query: queryText?.slice(0, 120) });
      const jsonRes = await postToMemoryService("/query", {
        query: queryText,
      });
      safeLog("[GhostWiki] Query result", {
        mode: jsonRes.mode,
        sourceCount: Array.isArray(jsonRes.sources)
          ? jsonRes.sources.length
          : 0,
      });
      if (correctionPath) {
        return { ...jsonRes, correctionPath };
      }
      return jsonRes;
    },
  );

  ipcMain.handle("ghostwiki:health", async () => {
    const port = process.env.MEMORY_SERVICE_PORT || "8765";
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const data = await res.json();
      const configuredWikiRoot =
        process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT;
      const warnings: string[] = [];
      if (
        typeof data.wiki_root === "string" &&
        data.wiki_root !== configuredWikiRoot
      ) {
        warnings.push(
          `Sidecar wiki_root (${data.wiki_root}) differs from app config (${configuredWikiRoot})`,
        );
      }
      return {
        active: data.status === "ok",
        mode: data.cognee_enabled ? "cognee" : "fallback",
        cogneeEnabled: data.cognee_enabled,
        wikiRoot: data.wiki_root || configuredWikiRoot,
        configuredWikiRoot,
        warnings,
      };
    } catch (e: any) {
      return {
        active: false,
        mode: "offline",
        cogneeEnabled: false,
        warnings: ["Memory service offline"],
      };
    }
  });

  ipcMain.handle("ghostwiki:lint", async () => {
    try {
      const data = await postToMemoryService("/lint");
      safeLog("[GhostWiki] Lint complete", {
        issueCount: Array.isArray(data.issues) ? data.issues.length : 0,
      });
      return data;
    } catch (e: any) {
      safeError("[GhostWiki] Lint failed", e);
      return {
        ok: false,
        mode: "offline",
        warnings: [e?.message || "Memory service offline"],
        issues: [],
      };
    }
  });

  registerReplayIpc(ipcMain, () => overlayWindow);
  registerClinicalIpc(ipcMain, () => clinicalWindow ?? overlayWindow);

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
      if (shouldOpenDevTools) {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
        overlayWindow?.webContents.openDevTools({ mode: "detach" });
      }
    }
  });
});

app.on("will-quit", () => {
  if (memorySidecarProcess) {
    memorySidecarProcess.kill();
  }
  uIOhook.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
