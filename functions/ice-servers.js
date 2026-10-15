const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getApps, getApp, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { mediaCapabilitiesAllowed } = require("./spec/media-policy");

// Configure this as the shared secret for a TURN server that supports the
// coturn REST API. It is never included in the Android APK or returned to clients.
const turnSharedSecret = defineSecret("SMARTCONTROL_TURN_CREDENTIAL");
const app = getApps().length ? getApp() : initializeApp();
const db = getFirestore(app);

exports.getWebRtcIceServers = onCall({ secrets: [turnSharedSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to establish a secure media session.");
  }

  const sessionId = String(request.data?.sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid approved media session is required.");
  }
  const sessionSnapshot = await db.collection("mediaSessions").doc(sessionId).get();
  if (!sessionSnapshot.exists) {
    throw new HttpsError("not-found", "Media session not found.");
  }
  const session = sessionSnapshot.data() || {};
  if (session.controllerUid !== request.auth.uid && session.targetDeviceId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "This account is not part of the media session.");
  }
  if (!["APPROVED", "ACTIVE"].includes(String(session.status || ""))) {
    throw new HttpsError("failed-precondition", "TURN credentials are only available for approved or active sessions.");
  }

  const [deviceSnapshot, globalPolicySnapshot, userPolicySnapshot] = await Promise.all([
    db.collection("devices").doc(session.targetDeviceId).get(),
    db.collection("featurePolicy").doc("global").get(),
    db.collection("featurePolicyUsers").doc(session.targetDeviceId).get()
  ]);
  const device = deviceSnapshot.exists ? deviceSnapshot.data() || {} : {};
  if (!deviceSnapshot.exists || device.controllerUid !== session.controllerUid || device.pairingActive !== true) {
    throw new HttpsError("failed-precondition", "The device pairing is no longer active.");
  }
  const userPolicy = userPolicySnapshot.exists ? userPolicySnapshot.data() || {} : null;
  if (!globalPolicySnapshot.exists || !mediaCapabilitiesAllowed(
    session.capabilities,
    globalPolicySnapshot.data() || {},
    userPolicy
  )) {
    throw new HttpsError("permission-denied", "Owner feature policy no longer allows this media session.");
  }

  const turnUrls = String(process.env.SMARTCONTROL_TURN_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
  let sharedSecret = "";
  if (turnUrls.length > 0) {
    try {
      sharedSecret = turnSharedSecret.value();
    } catch (_) {
      // Missing TURN secret leaves a safe STUN-only configuration; it never
      // causes the authorization-checked callable itself to fail.
      sharedSecret = "";
    }
  }
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
