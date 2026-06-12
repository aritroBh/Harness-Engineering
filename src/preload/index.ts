import { contextBridge } from "electron";

const practiceApi = Object.freeze({});

// The practice window is a controlled demo surface and does not need IPC access.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", practiceApi);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = practiceApi;
}
