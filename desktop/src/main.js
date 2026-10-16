const { app, BrowserWindow, session, desktopCapturer, dialog } = require("electron");
const path = require("node:path");

let buildConfig = {};
try { buildConfig = require("./build-config.json"); } catch (_) { /* source checkout may not have generated packaging config */ }
const apiBase = String(process.env.SMARTCONTROL_API_BASE_URL || buildConfig.apiBaseUrl || "").trim().replace(/\/$/, "");
const configuredWebUrl = String(process.env.SMARTCONTROL_WEB_URL || buildConfig.webUrl || "").trim();

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

  // Keep the main application pinned to its configured origin. Firebase/Google
  // sign-in needs an HTTPS popup, so allow only HTTPS popup URLs and give those
  // child windows the same isolated, sandboxed renderer settings.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (!trustedOrigin || target.protocol !== "https:" || !target.hostname || target.username || target.password) {
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
          }
        }
      };
    } catch (_) {
      return { action: "deny" };
    }
  });
  win.webContents.on("did-create-window", child => {
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    child.webContents.on("will-navigate", (event, targetUrl) => {
      try {
        const target = new URL(targetUrl);
        if (target.protocol === "https:" && target.hostname && !target.username && !target.password) return;
      } catch (_) { /* invalid target is blocked below */ }
      event.preventDefault();
    });
  });
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (trustedOrigin && isTrustedOrigin(targetUrl)) return;
    if (!trustedOrigin && targetUrl.startsWith("data:text/html;charset=utf-8,")) return;
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
