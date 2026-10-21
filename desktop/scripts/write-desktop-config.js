const fs = require("node:fs");
const path = require("node:path");

function normalizeUrl(name, value, allowPath) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new Error(name + " must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error(name + " must use HTTPS and cannot contain credentials, query parameters, or fragments.");
  }
  if (!allowPath && url.pathname !== "/") {
    throw new Error(name + " must be an origin URL without a path.");
  }
  return url.toString().replace(/\/$/, "");
}

const config = {
  webUrl: normalizeUrl("SMARTCONTROL_WEB_URL", process.env.SMARTCONTROL_WEB_URL, true),
  apiBaseUrl: normalizeUrl("SMARTCONTROL_API_BASE_URL", process.env.SMARTCONTROL_API_BASE_URL, false)
};
const output = path.join(__dirname, "..", "src", "build-config.json");
fs.writeFileSync(output, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
console.log("Desktop build configuration generated; URLs only, no credentials embedded.");
