const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  transcribe: (audioData) => ipcRenderer.invoke("transcribe", audioData),
  detectHands: (frameData) => ipcRenderer.invoke("detect-hands", frameData),
  saveStats: (data) => ipcRenderer.invoke("save-stats", data),
  getStats: () => ipcRenderer.invoke("get-stats"),
  clearStats: () => ipcRenderer.invoke("clear-stats"),
  // 读本地文件改走主进程 IPC(preload 不依赖 Node fs,兼容 sandbox 模式)
  readLocalFile: (filePath) => ipcRenderer.invoke("read-local-file", filePath),
});