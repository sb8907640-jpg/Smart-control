const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("smartControlDesktop", Object.freeze({
  platform: process.platform,
  version: process.versions.electron
}));
