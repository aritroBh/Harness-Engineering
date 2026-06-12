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

const clinical = {
  bundleGet: () => ipcRenderer.invoke("clinical:bundle:get"),
  bundleReset: () => ipcRenderer.invoke("clinical:bundle:reset"),
  bundleAddClipboard: (meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("clinical:bundle:add-clipboard", meta ?? {}),
  bundleAddManual: (rawText: string, meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("clinical:bundle:add-manual", rawText, meta ?? {}),
  bundleAddFixture: (rawText: string, meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("clinical:bundle:add-fixture", { rawText, meta }),

  workflowCompile: () => ipcRenderer.invoke("clinical:workflow:compile"),
  workflowDryrun: () => ipcRenderer.invoke("clinical:workflow:dryrun"),
  workflowRun: (mode: "dry_run" | "clinician_confirmed") =>
    ipcRenderer.invoke("clinical:workflow:run", mode),

  draftGenerate: (draftNoteType?: string) =>
    ipcRenderer.invoke("clinical:draft:generate", draftNoteType),
  draftGet: () => ipcRenderer.invoke("clinical:draft:get"),

  safetyListProhibited: () =>
    ipcRenderer.invoke("clinical:safety:list-prohibited"),

  apexGet: () => ipcRenderer.invoke("clinical:apex:get"),
  apexStart: () => ipcRenderer.invoke("clinical:apex:start"),
  apexReset: () => ipcRenderer.invoke("clinical:apex:reset"),
  apexAdvance: (opts?: { capturedSourceId?: string }) =>
    ipcRenderer.invoke("clinical:apex:advance", opts ?? {}),
  apexRepeatIteration: () =>
    ipcRenderer.invoke("clinical:apex:repeat-iteration"),
  apexCaptureClipboard: (meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("clinical:apex:capture-clipboard", meta ?? {}),
  apexCaptureManual: (rawText: string, meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("clinical:apex:capture-manual", rawText, meta ?? {}),
  apexDryrun: () => ipcRenderer.invoke("clinical:apex:dryrun"),
  apexSummaryGenerate: (scope?: string) =>
    ipcRenderer.invoke("clinical:apex:summary:generate", scope),
  apexSummaryGet: () => ipcRenderer.invoke("clinical:apex:summary:get"),

  windowClose: () => ipcRenderer.invoke("clinical:window:close"),

  onBundleUpdated: (cb: (data: any) => void) =>
    onIpc("clinical:bundle-updated", cb),
  onWorkflowTrace: (cb: (data: any) => void) =>
    onIpc("clinical:workflow-trace", cb),
  onDraftGenerated: (cb: (data: any) => void) =>
    onIpc("clinical:draft-generated", cb),
  onApexUpdated: (cb: (data: any) => void) =>
    onIpc("clinical:apex-updated", cb),
  onApexSummaryGenerated: (cb: (data: any) => void) =>
    onIpc("clinical:apex-summary-generated", cb),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("clinical", clinical);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore
  window.clinical = clinical;
}
