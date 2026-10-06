const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const apiBase = String(process.env.SMARTCONTROL_API_BASE_URL || "").replace(/\/$/, "");

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 800, minHeight: 600,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const target = process.env.SMARTCONTROL_WEB_URL;
  if (target) return win.loadURL(target);
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    "<main style='font-family:system-ui;padding:32px'><h1>Smart Control Desktop</h1>" +
    "<p>Configure SMARTCONTROL_WEB_URL to load the deployed Smart Control web application.</p>" +
    "<p>Backend API: " + (apiBase || "not configured") + "</p></main>"
  ));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
