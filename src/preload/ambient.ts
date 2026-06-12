import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ambientApi", {
  sendAudioChunk: (audioData: ArrayBuffer) =>
    ipcRenderer.invoke("ambient:audio-chunk", audioData),
});
