const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

// Configure this as the shared secret for a TURN server that supports the
// coturn REST API. It is never included in the Android APK or returned to clients.
const turnSharedSecret = defineSecret("SMARTCONTROL_TURN_CREDENTIAL");

exports.getWebRtcIceServers = onCall({ secrets: [turnSharedSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to establish a secure media session.");
  }

  const turnUrls = String(process.env.SMARTCONTROL_TURN_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
  const sharedSecret = turnSharedSecret.value();
  let turnConfigured = false;
  let expiresAtEpochSeconds = null;

  if (turnUrls.length > 0 && sharedSecret) {
    // Short-lived TURN REST credentials: username expiry:uid, password HMAC-SHA1.
    expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiresAtEpochSeconds}:${request.auth.uid}`;
    const credential = crypto.createHmac("sha1", sharedSecret).update(username).digest("base64");
    iceServers.push({ urls: turnUrls, username, credential });
    turnConfigured = true;
  }

  return { iceServers, turnConfigured, expiresAtEpochSeconds };
});
