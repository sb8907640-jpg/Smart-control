const crypto = require("node:crypto");

const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

function createTurnConfiguration({ rawUrls, sharedSecret, uid, nowMs = Date.now() }) {
  const turnUrls = String(rawUrls || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const iceServers = [{ urls: [DEFAULT_STUN_URL] }];

  if (turnUrls.length === 0) {
    return { iceServers, turnConfigured: false, expiresAtEpochSeconds: null };
  }
  if (turnUrls.some((url) => !/^turns?:/i.test(url))) {
    throw new Error("SMARTCONTROL_TURN_URLS must contain only turn: or turns: URLs.");
  }
  const secret = String(sharedSecret || "").trim();
  if (!secret) {
    throw new Error("TURN is configured but SMARTCONTROL_TURN_CREDENTIAL is unavailable.");
  }
  if (!String(uid || "").trim()) {
    throw new Error("A verified account UID is required to mint TURN credentials.");
  }

  // Coturn REST credentials expire after one hour and are scoped to this UID.
  const expiresAtEpochSeconds = Math.floor(nowMs / 1000) + 3600;
  const username = `${expiresAtEpochSeconds}:${uid}`;
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
  iceServers.push({ urls: turnUrls, username, credential });
  return { iceServers, turnConfigured: true, expiresAtEpochSeconds };
}

module.exports = { createTurnConfiguration, DEFAULT_STUN_URL };
