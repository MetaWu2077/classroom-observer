const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let pythonProcess;
const PYTHON_SERVER_URL = "http://127.0.0.1:28765";

function startPythonServer() {
  const pythonScript = path.join(__dirname, "../python/server.py");
  pythonProcess = spawn("python", [pythonScript], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (data) => {
    console.log("[Python]", data.toString());
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error("[Python Error]", data.toString());
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
  });
}

async function waitForPythonServer(timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/stats`);
      if (response.ok) return true;
    } catch (err) {
      // Server not ready yet, continue polling.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/dist/index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.env.EXTERNAL_PYTHON_SERVER !== "1") {
    startPythonServer();
  }
  waitForPythonServer().finally(() => {
    createWindow();
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess && process.env.EXTERNAL_PYTHON_SERVER !== "1") {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("transcribe", async (event, audioData) => {
  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_data: audioData }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: data.error || "Transcribe request failed" };
    }
    return data;
  } catch (error) {
    return { error: `Python service unavailable: ${error.message}` };
  }
});

ipcMain.handle("detect-hands", async (event, frameData) => {
  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/detect_hands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_data: frameData }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: data.error || "Hand detection request failed" };
    }
    return data;
  } catch (error) {
    return { error: `Python service unavailable: ${error.message}` };
  }
});

ipcMain.handle("save-stats", async (event, data) => {
  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || "Save stats request failed" };
    }
    return result;
  } catch (error) {
    return { error: `Python service unavailable: ${error.message}` };
  }
});

ipcMain.handle("get-stats", async () => {
  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/stats`);
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || "Get stats request failed" };
    }
    return result;
  } catch (error) {
    return { error: `Python service unavailable: ${error.message}` };
  }
});

ipcMain.handle("clear-stats", async () => {
  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/stats`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || "Clear stats request failed" };
    }
    return result;
  } catch (error) {
    return { error: `Python service unavailable: ${error.message}` };
  }
});