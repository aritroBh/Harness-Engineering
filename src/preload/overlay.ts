import { contextBridge, ipcRenderer } from "electron";

function onIpc(
  channel: string,
  callback: (...args: any[]) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) =>
    callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Custom APIs for renderer
const api = {
  getStartupMode: () => ipcRenderer.invoke("env:getStartupMode"),

  // Cursor
  moveRealMouse: (
    x: number,
    y: number,
    durationMs?: number,
    expectedDisplayId?: number,
  ) => ipcRenderer.invoke("cursor:move", x, y, durationMs, expectedDisplayId),
  clickRealMouse: (x: number, y: number, expectedDisplayId?: number) =>
    ipcRenderer.invoke("cursor:click", x, y, expectedDisplayId),
  executeRealMouseSteps: (steps: any[]) =>
    ipcRenderer.invoke("cursor:replay", steps),
  moveCursor: (
    x: number,
    y: number,
    durationMs?: number,
    expectedDisplayId?: number,
  ) => ipcRenderer.invoke("cursor:move", x, y, durationMs, expectedDisplayId),
  clickCursor: (x: number, y: number, expectedDisplayId?: number) =>
    ipcRenderer.invoke("cursor:click", x, y, expectedDisplayId),
  replaySteps: (steps: any[]) => ipcRenderer.invoke("cursor:replay", steps),
  getCursorPosition: () => ipcRenderer.invoke("cursor:getPosition"),
  getCursorPercent: () => ipcRenderer.invoke("cursor:getPositionPercent"),
  getCursorCalibration: () => ipcRenderer.invoke("cursor:diagnostics"),
  mapPercentToScreen: (input: { x: number; y: number }) =>
    ipcRenderer.invoke("coordinate:mapPercentToScreen", input),
  moveCursorToScreenCenter: () => ipcRenderer.invoke("cursor:moveCenter"),
  waitForCursorTarget: (
    x: number,
    y: number,
    tolerancePx?: number,
    timeoutMs?: number,
  ) => ipcRenderer.invoke("cursor:waitForTarget", x, y, tolerancePx, timeoutMs),

  getPeekabooStatus: () => ipcRenderer.invoke("automation:peekaboo-status"),
  // Automation Gate
  requestAutomationSession: (mode: string, steps?: number) =>
    ipcRenderer.invoke("automation:request", mode, steps),
  confirmAutomationSession: (token: string) =>
    ipcRenderer.invoke("automation:confirm", token),
  cancelAutomationSession: () => ipcRenderer.invoke("automation:cancel"),

  // Overlay
  hideOverlay: () => ipcRenderer.send("overlay:hide"),
  setOverlayClickThrough: (clickThrough: boolean) =>
    ipcRenderer.invoke("overlay:setClickThrough", clickThrough),
  onOverlayToggle: (callback: () => void) => onIpc("overlay:toggle", callback),
  onFocusInput: (callback: () => void) =>
    onIpc("overlay:focus-input", callback),

  // Screen
  captureScreen: () => ipcRenderer.invoke("screen:capture"),
  analyzeScreen: (
    base64PNG?: string,
    options?: { captureUnderlying?: boolean },
  ) => ipcRenderer.invoke("screen:analyze", base64PNG, options),
  onScreenPermissionDenied: (callback: () => void) =>
    onIpc("permissions:screen-denied", callback),

  // Real App Test
  detectRealAppTargets: (userIntent: string) =>
    ipcRenderer.invoke("realApp:detectTargets", userIntent),
  createRealAppWorkflow: (input: any) =>
    ipcRenderer.invoke("realApp:createWorkflow", input),

  // Planner
  planSteps: (
    userIntent: string,
    screenState: any,
    sessionHistory: any[],
    mode: string,
  ) =>
    ipcRenderer.invoke(
      "planner:plan",
      userIntent,
      screenState,
      sessionHistory,
      mode,
    ),
  converse: (
    userMessage: string,
    screenState: any,
    conversationHistory: any[],
  ) =>
    ipcRenderer.invoke(
      "planner:converse",
      userMessage,
      screenState,
      conversationHistory,
    ),
  ultraConverse: (payload: any) =>
    ipcRenderer.invoke("ultra:converse", payload),
  resolveLiveTarget: (targetLabel: string, action: string) =>
    ipcRenderer.invoke("live:resolveTarget", { targetLabel, action }),
  compileNotesToHtml: (input: any) =>
    ipcRenderer.invoke("agent:compileNoteHtml", input),
  checkAIBackend: () => ipcRenderer.invoke("ai:healthCheck"),
  healthCheck: () => ipcRenderer.invoke("ai:healthCheck"),

  // Behavioral model / Spec
  behaviorGetState: () => ipcRenderer.invoke("behavior:getState"),
  behaviorRecordFrame: (frame: any) =>
    ipcRenderer.invoke("behavior:recordFrame", frame),
  behaviorCreateCheckpoint: () =>
    ipcRenderer.invoke("behavior:createCheckpoint"),
  behaviorListCheckpoints: () => ipcRenderer.invoke("behavior:listCheckpoints"),
  behaviorDiffCheckpoints: (fromId: string, toId: string) =>
    ipcRenderer.invoke("behavior:diffCheckpoints", fromId, toId),
  behaviorBlendCheckpoints: (fromId: string, toId: string, t: number) =>
    ipcRenderer.invoke("behavior:blendCheckpoints", fromId, toId, t),
  behaviorSeedDemo: () => ipcRenderer.invoke("behavior:seedDemo"),
  behaviorRecordFeedback: (input: any) =>
    ipcRenderer.invoke("behavior:feedback", input),
  runMirrorMode: (input: any) => ipcRenderer.invoke("mirror:run", input),
  onSpecState: (callback: (data: any) => void) => onIpc("spec:state", callback),
  onSpecMood: (callback: (data: any) => void) => onIpc("spec:mood", callback),
  onBehaviorCheckpointCreated: (callback: (data: any) => void) =>
    onIpc("behavior:checkpoint-created", callback),
  onBehaviorPermissionsWarning: (callback: (data: any) => void) =>
    onIpc("behavior:permissions-warning", callback),
  onMirrorStarted: (callback: (data: any) => void) =>
    onIpc("mirror:started", callback),
  onMirrorComplete: (callback: (data: any) => void) =>
    onIpc("mirror:complete", callback),
  onMirrorError: (callback: (data: any) => void) =>
    onIpc("mirror:error", callback),

  // Session
  saveSession: (graph: any) => ipcRenderer.invoke("session:save", graph),
  loadSession: (appName?: string) =>
    ipcRenderer.invoke("session:load", appName),
  getResumePrompt: (appName?: string) =>
    ipcRenderer.invoke("session:resume-prompt", appName),
  startRecording: () => ipcRenderer.invoke("session:record-start"),
  recordStep: (step: any) => ipcRenderer.invoke("session:record-step", step),
  stopRecording: () => ipcRenderer.invoke("session:record-stop"),
  saveNode: (nodeId: string, steps: any[], appName?: string) =>
    ipcRenderer.invoke("session:save-node", nodeId, steps, appName),
  markNodeComplete: (nodeId: string, appName?: string) =>
    ipcRenderer.invoke("session:mark-complete", nodeId, appName),
  createBranch: (fromNodeId: string, fromStep: number, appName?: string) =>
    ipcRenderer.invoke("session:create-branch", fromNodeId, fromStep, appName),
  getNextNode: (appName?: string) =>
    ipcRenderer.invoke("session:next-node", appName),
  getAvailableNodes: (appName?: string) =>
    ipcRenderer.invoke("session:available-nodes", appName),

  // Bandit
  selectStyle: (appName?: string) =>
    ipcRenderer.invoke("bandit:select", appName),
  recordReward: (arm: string, reward: number, appName?: string) =>
    ipcRenderer.invoke("bandit:reward", arm, reward, appName),
  getCurrentStyle: (appName?: string) =>
    ipcRenderer.invoke("bandit:style", appName),

  // TTS & Whisper
  speak: (text: string) => ipcRenderer.invoke("tts:speak", text),
  stopSpeaking: () => ipcRenderer.invoke("tts:stop"),
  testVoiceOutput: () => ipcRenderer.invoke("ai:testVoiceOutput"),
  transcribe: (audioData: ArrayBuffer) =>
    ipcRenderer.invoke("whisper:transcribe", audioData),

  // Replay System
  walkthrough: (nodeId?: string) =>
    ipcRenderer.invoke("replay:walkthrough", nodeId),
  autoExecute: (nodeId?: string) => ipcRenderer.invoke("replay:auto", nodeId),
  stopReplay: () => ipcRenderer.invoke("replay:stop"),
  confirmReplayStep: () => ipcRenderer.invoke("replay:confirmStep"),
  onReplayStep: (callback: (data: any) => void) =>
    onIpc("replay:step", callback),
  onReplayRetry: (callback: (data: any) => void) =>
    onIpc("replay:retry", callback),
  onReplayTargetReached: (callback: (data: any) => void) =>
    onIpc("replay:target-reached", callback),
  onReplayConfirmNeeded: (callback: (data: any) => void) =>
    onIpc("replay:confirm-needed", callback),
  onReplayConfirmCleared: (callback: () => void) =>
    onIpc("replay:confirm-cleared", callback),
  onReplayProgress: (callback: (data: any) => void) =>
    onIpc("replay:progress", callback),
  onReplayComplete: (callback: () => void) =>
    onIpc("replay:complete", callback),
  onReplayStopped: (callback: () => void) => onIpc("replay:stopped", callback),

  // Demo
  prepareControlledDemo: () => ipcRenderer.invoke("demo:controlledWorkflow"),

  // GhostWiki
  ghostwikiIngestSession: (sessionId: string, appName: string) =>
    ipcRenderer.invoke("ghostwiki:ingest-current-session", sessionId, appName),
  ghostwikiQuery: (
    query: string,
    sourceSessionId?: string,
    feedbackType?: string,
    feedbackDetails?: string,
  ) =>
    ipcRenderer.invoke(
      "ghostwiki:query",
      query,
      sourceSessionId,
      feedbackType,
      feedbackDetails,
    ),
  ghostwikiLint: () => ipcRenderer.invoke("ghostwiki:lint"),
  ghostwikiHealth: () => ipcRenderer.invoke("ghostwiki:health"),

  // Context + proactive prediction
  getContextSnapshot: () => ipcRenderer.invoke("context:get"),
  refreshContextSnapshot: () => ipcRenderer.invoke("context:refresh"),
  getProactivePrediction: () => ipcRenderer.invoke("proactive:predict"),


  // Part A — tutor session (one-step-at-a-time loop)
  startTutorSession: (goal: string, appHint?: string) =>
    ipcRenderer.invoke("session:start", { goal, appHint }),
  getCurrentStep: () => ipcRenderer.invoke("step:current"),
  getPermissionStatus: () => ipcRenderer.invoke("permissions:get"),
  getDebugTree: () => ipcRenderer.invoke("debug:tree"),
  getSkillProfile: (app: string) => ipcRenderer.invoke("profile:get", app),
  seedDemoProfile: (app?: string) => ipcRenderer.invoke("profile:seed-demo", app),
  // thinking | step_advanced | step_corrected | goal_complete
  onSpecEvent: (callback: (event: any) => void) =>
    onIpc("spec:event", callback),
};

// Expose only the overlay-specific IPC facade.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
