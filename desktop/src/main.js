const { app, BrowserWindow, session, desktopCapturer, dialog } = require("electron");
const path = require("node:path");

const apiBase = String(process.env.SMARTCONTROL_API_BASE_URL || "").trim().replace(/\/$/, "");
const configuredWebUrl = String(process.env.SMARTCONTROL_WEB_URL || "").trim();

function validatedWebUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return null;
    return url;
  } catch (_) {
    return null;
  }
}

const trustedWebUrl = validatedWebUrl(configuredWebUrl);
const trustedOrigin = trustedWebUrl?.origin || null;

function isTrustedOrigin(value) {
  if (!trustedOrigin) return false;
  try {
    return new URL(value).origin === trustedOrigin;
  } catch (_) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 800, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Do not let the trusted app window navigate to an untrusted origin or open
  // a second window that escapes the configured application origin.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (trustedOrigin && isTrustedOrigin(targetUrl)) return;
    event.preventDefault();
  });

  if (trustedWebUrl) return win.loadURL(trustedWebUrl.toString());
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    "<main style='font-family:system-ui;padding:32px'><h1>Smart Control Desktop</h1>" +
    "<p>Configure SMARTCONTROL_WEB_URL with the HTTPS URL of the Smart Control web application.</p>" +
    "<p>Backend API: " + escapeHtml(apiBase || "not configured") + "</p></main>"
  ));
}

app.whenReady().then(() => {
  // Default-deny Electron permissions. Only the configured HTTPS web origin may
  // request camera/microphone media and desktop notifications.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents?.getURL() || "";
    const allowedPermission = permission === "media" || permission === "notifications";
    callback(Boolean(allowedPermission && isTrustedOrigin(requestingUrl)));
  });

  // Screen capture is a separate, explicit request. Present a native source
  // chooser and only grant the source the user selected; never auto-select a
  // screen/window or grant capture to an untrusted origin.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!request.videoRequested || !isTrustedOrigin(request.securityOrigin || "")) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 }
      });
      if (!sources.length) {
        callback({});
        return;
      }
      const buttons = ["Cancel", ...sources.map(source => source.name)];
      const selection = await dialog.showMessageBox({
        type: "question",
        title: "Share your screen",
        message: "Choose the screen or window you want to share.",
        buttons,
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      const sourceIndex = selection.response - 1;
      if (sourceIndex < 0 || sourceIndex >= sources.length) {
        callback({});
        return;
      }
      callback({ video: sources[sourceIndex] });
    } catch (_) {
      callback({});
    }
  });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
