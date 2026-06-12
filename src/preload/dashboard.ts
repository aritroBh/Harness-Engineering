import { contextBridge, ipcRenderer } from "electron";

const dashboard = {
  listMemories: () => ipcRenderer.invoke("dashboard:listMemories"),
  getProgress: () => ipcRenderer.invoke("dashboard:getProgress"),
};

contextBridge.exposeInMainWorld("dashboard", dashboard);

export type DashboardApi = typeof dashboard;
