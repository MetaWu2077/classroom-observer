const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// 在主进程读取本地文件并以 base64 字符串返回,避开 renderer 直接 fetch(file://) 的 CORS 限制
async function readLocalFileAsBase64(filePath) {
  try {
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime =
      ext === "png" ? "image/png" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (err) {
    throw new Error("readLocalFile failed: " + err.message);
  }
}

contextBridge.exposeInMainWorld("api", {
  transcribe: (audioData) => ipcRenderer.invoke("transcribe", audioData),
  detectHands: (frameData) => ipcRenderer.invoke("detect-hands", frameData),
  saveStats: (data) => ipcRenderer.invoke("save-stats", data),
  getStats: () => ipcRenderer.invoke("get-stats"),
  clearStats: () => ipcRenderer.invoke("clear-stats"),
  readLocalFile: readLocalFileAsBase64,
});