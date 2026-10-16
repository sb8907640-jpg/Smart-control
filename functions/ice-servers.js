const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getApps, getApp, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { mediaCapabilitiesAllowed } = require("./spec/media-policy");
const { createTurnConfiguration } = require("./spec/turn-config");
const { CURRENT_LEGAL_CONSENT_VERSION, isCurrentConsentRecord } = require("./spec/consent-policy");

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

  const [
    deviceSnapshot,
    controllerUserSnapshot,
    targetUserSnapshot,
    controllerAccessSnapshot,
    targetAccessSnapshot,
    globalPolicySnapshot,
    userPolicySnapshot,
    controllerConsentSnapshot,
    targetConsentSnapshot
  ] = await Promise.all([
    db.collection("devices").doc(session.targetDeviceId).get(),
    db.collection("users").doc(session.controllerUid).get(),
    db.collection("users").doc(session.targetDeviceId).get(),
    db.collection("userAccess").doc(session.controllerUid).get(),
    db.collection("userAccess").doc(session.targetDeviceId).get(),
    db.collection("featurePolicy").doc("global").get(),
    db.collection("featurePolicyUsers").doc(session.targetDeviceId).get(),
    db.collection("consentHistory").doc(`${session.controllerUid}_${CURRENT_LEGAL_CONSENT_VERSION}`).get(),
    db.collection("consentHistory").doc(`${session.targetDeviceId}_${CURRENT_LEGAL_CONSENT_VERSION}`).get()
  ]);
  const device = deviceSnapshot.exists ? deviceSnapshot.data() || {} : {};
  if (!deviceSnapshot.exists || device.controllerUid !== session.controllerUid || device.pairingActive !== true) {
    throw new HttpsError("failed-precondition", "The device pairing is no longer active.");
  }
  const isActiveAccount = (snapshot) =>
    !snapshot.exists || String(snapshot.data()?.status || "ACTIVE").toUpperCase() === "ACTIVE";
  if (!isActiveAccount(controllerUserSnapshot) || !isActiveAccount(targetUserSnapshot) ||
      (controllerAccessSnapshot.exists && controllerAccessSnapshot.data()?.blocked === true) ||
      (targetAccessSnapshot.exists && targetAccessSnapshot.data()?.blocked === true)) {
    throw new HttpsError("permission-denied", "A suspended or blocked account cannot use media sessions.");
  }
  const userPolicy = userPolicySnapshot.exists ? userPolicySnapshot.data() || {} : null;
  if (!isCurrentConsentRecord(
        controllerConsentSnapshot.exists ? controllerConsentSnapshot.data() : null,
        session.controllerUid
      ) ||
      !isCurrentConsentRecord(
        targetConsentSnapshot.exists ? targetConsentSnapshot.data() : null,
        session.targetDeviceId
      )) {
    throw new HttpsError(
      "permission-denied",
      "Both devices must have a current server-recorded legal consent before media connectivity is authorized."
    );
  }
  if (!globalPolicySnapshot.exists || !mediaCapabilitiesAllowed(
    session.capabilities,
    globalPolicySnapshot.data() || {},
    userPolicy
  )) {
    throw new HttpsError("permission-denied", "Owner feature policy no longer allows this media session.");
  }

  let turnConfiguration;
  try {
    let sharedSecret = "";
    if (String(process.env.SMARTCONTROL_TURN_URLS || "").trim()) {
      try {
        sharedSecret = String(turnSharedSecret.value() || "").trim();
      } catch (_) {
        sharedSecret = "";
      }
    }
    turnConfiguration = createTurnConfiguration({
      rawUrls: process.env.SMARTCONTROL_TURN_URLS,
      sharedSecret,
      uid: request.auth.uid
    });
  } catch (error) {
    throw new HttpsError("failed-precondition", error.message || "TURN configuration is invalid.");
  }
  const { iceServers, turnConfigured, expiresAtEpochSeconds } = turnConfiguration;

  return { iceServers, turnConfigured, expiresAtEpochSeconds };
});
