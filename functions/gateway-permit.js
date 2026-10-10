const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getApps, getApp, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const gatewayEncryptionKey = defineSecret("SMARTCONTROL_GATEWAY_ENCRYPTION_KEY");
exports.gatewayEncryptionKey = gatewayEncryptionKey;
const app = getApps().length ? getApp() : initializeApp();
const db = getFirestore(app);
const CONFIG_REF = db.doc("ownerSettings/global");

// Only gateway adapters implemented and verified in server code may be activated.
// A display name alone cannot make an arbitrary payment provider compatible.
const IMPLEMENTED_PROVIDERS = new Set(["RAZORPAY"]);

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
}

async function requireOwner(request) {
  requireSignedIn(request);
  const claims = request.auth.token || {};
  if (claims.owner === true || String(claims.role || "").toUpperCase() === "OWNER") return;

  // The existing Owner Accounts screen stores owner identifiers here.
  const snap = await db.doc("ownerAccounts/config").get();
  const cfg = snap.exists ? snap.data() || {} : {};
  const email = String(claims.email || "").trim().toLowerCase();
  const phone = String(claims.phone_number || "").trim();
  const emails = Array.isArray(cfg.emails) ? cfg.emails.map(v => String(v).trim().toLowerCase()) : [];
  const mobiles = Array.isArray(cfg.mobiles) ? cfg.mobiles.map(v => String(v).trim()) : [];
  if ((email && emails.includes(email)) || (phone && mobiles.includes(phone))) return;
  throw new HttpsError("permission-denied", "Only a configured Family Suraksha Owner can change the payment gateway.");
}

function encryptionKey() {
  const raw = String(gatewayEncryptionKey.value() || "").trim();
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new HttpsError("failed-precondition", "Server gateway encryption key is missing or invalid. Configure SMARTCONTROL_GATEWAY_ENCRYPTION_KEY as a 32-byte base64 or 64-character hex value.");
  }
  return key;
}

function encryptCredentials(credentials) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptCredentials(encrypted) {
  if (!encrypted || encrypted.version !== 1) {
    throw new HttpsError("failed-precondition", "Gateway credentials are not configured.");
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encrypted.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(clear);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("failed-precondition", "Stored gateway credentials could not be decrypted. Check the server encryption key.");
  }
}

exports.savePaymentGatewayPermit = onCall(
  { secrets: [gatewayEncryptionKey] },
  async (request) => {
    await requireOwner(request);
    const provider = String(request.data?.provider || "").trim().toUpperCase();
    const displayName = String(request.data?.displayName || "").trim();
    const enabled = request.data?.enabled !== false;
    const keyId = String(request.data?.keyId || "").trim();
    const keySecret = String(request.data?.keySecret || "").trim();
    const webhookSecret = String(request.data?.webhookSecret || "").trim();

    if (!IMPLEMENTED_PROVIDERS.has(provider)) {
      throw new HttpsError("failed-precondition", "This gateway adapter is not implemented yet. Currently the working adapter is Razorpay; adding another name alone is not enough.");
    }
    if (displayName.length < 2 || displayName.length > 80) {
      throw new HttpsError("invalid-argument", "Gateway display name must be 2–80 characters.");
    }
    if (!keyId || !keySecret || !webhookSecret) {
      throw new HttpsError("invalid-argument", "Enter the gateway Key ID, Key Secret, and Webhook Secret. Secrets are sent only to this server function and are never returned to the app.");
    }

    const now = Date.now();
    const existing = await CONFIG_REF.get();
    const previous = existing.exists ? existing.data()?.paymentGatewayPermit || {} : {};
    const permit = {
      enabled,
      provider,
      displayName,
      encryptedCredentials: encryptCredentials({ keyId, keySecret, webhookSecret }),
      credentialFieldsConfigured: { keyId: true, keySecret: true, webhookSecret: true },
      updatedAtEpochMs: now,
      updatedBy: request.auth.uid,
      revision: Number(previous.revision || 0) + 1
    };
    await db.collection("paymentGatewayPermitVersions").doc(String(permit.revision)).set(permit);
    await CONFIG_REF.set({ paymentGatewayPermit: permit }, { merge: true });
    return {
      ok: true,
      enabled,
      provider,
      displayName,
      revision: permit.revision,
      updatedAtEpochMs: now
    };
  }
);

exports.getPaymentGatewayPermit = onCall(async (request) => {
  await requireOwner(request);
  const snap = await CONFIG_REF.get();
  const permit = snap.exists ? snap.data()?.paymentGatewayPermit : null;
  if (!permit) {
    return { configured: false, enabled: false, provider: null, displayName: "", credentialFieldsConfigured: { keyId: false, keySecret: false, webhookSecret: false } };
  }
  return {
    configured: true,
    enabled: permit.enabled === true,
    provider: String(permit.provider || ""),
    displayName: String(permit.displayName || ""),
    credentialFieldsConfigured: permit.credentialFieldsConfigured || { keyId: false, keySecret: false, webhookSecret: false },
    updatedAtEpochMs: Number(permit.updatedAtEpochMs || 0),
    revision: Number(permit.revision || 0)
  };
});

// Server-only helper. Never expose its result from a callable endpoint or log it.
exports.getActiveGatewayPermit = async function getActiveGatewayPermit(revision = null) {
  let permit = null;
  if (revision !== null && revision !== undefined && Number(revision) > 0) {
    const versionSnap = await db.collection("paymentGatewayPermitVersions").doc(String(Number(revision))).get();
    permit = versionSnap.exists ? versionSnap.data() : null;
  } else {
    const snap = await CONFIG_REF.get();
    permit = snap.exists ? snap.data()?.paymentGatewayPermit : null;
    if (permit && permit.enabled !== true) {
      throw new HttpsError("failed-precondition", "The Owner has disabled the Payment Gateway Permit.");
    }
  }
  if (!permit) return null; // Backward-compatible fallback to existing server secrets.
  const provider = String(permit.provider || "").toUpperCase();
  if (!IMPLEMENTED_PROVIDERS.has(provider)) {
    throw new HttpsError("failed-precondition", "The selected payment gateway does not have a server adapter.");
  }
  return {
    provider,
    displayName: String(permit.displayName || provider),
    revision: Number(permit.revision || 0),
    credentials: decryptCredentials(permit.encryptedCredentials)
  };
};
