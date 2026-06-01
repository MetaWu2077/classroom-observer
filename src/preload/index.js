const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  transcribe: (audioData) => ipcRenderer.invoke("transcribe", audioData),
  detectHands: (frameData) => ipcRenderer.invoke("detect-hands", frameData),
  saveStats: (data) => ipcRenderer.invoke("save-stats", data),
  getStats: () => ipcRenderer.invoke("get-stats"),
  clearStats: () => ipcRenderer.invoke("clear-stats"),
});