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
    const mode = String(request.data?.mode || "LIVE").trim().toUpperCase();
    const keyId = String(request.data?.keyId || "").trim();
    const keySecret = String(request.data?.keySecret || "").trim();
    const webhookSecret = String(request.data?.webhookSecret || "").trim();

    if (!IMPLEMENTED_PROVIDERS.has(provider)) {
      throw new HttpsError("failed-precondition", "This gateway adapter is not implemented yet. Currently the working adapter is Razorpay; adding another name alone is not enough.");
    }
    if (!["TEST", "LIVE"].includes(mode)) {
      throw new HttpsError("invalid-argument", "Gateway mode must be TEST or LIVE.");
    }
    if (displayName.length < 2 || displayName.length > 80) {
      throw new HttpsError("invalid-argument", "Gateway display name must be 2–80 characters.");
    }
    const now = Date.now();
    const existing = await CONFIG_REF.get();
    const previous = existing.exists ? existing.data()?.paymentGatewayPermit || {} : {};
    const hasNewCredentials = Boolean(keyId && keySecret && webhookSecret);
    if (hasNewCredentials && mode === "TEST" && !keyId.startsWith("rzp_test_")) {
      throw new HttpsError("invalid-argument", "Test mode requires a Razorpay test Key ID (rzp_test_…).");
    }
    if (hasNewCredentials && mode === "LIVE" && !keyId.startsWith("rzp_live_")) {
      throw new HttpsError("invalid-argument", "Live mode requires a Razorpay live Key ID (rzp_live_…).");
    }
    if (enabled && !hasNewCredentials) {
      throw new HttpsError("invalid-argument", "To enable the gateway or replace its credentials, enter Key ID, Key Secret, and Webhook Secret.");
    }
    const encryptedCredentials = hasNewCredentials
      ? encryptCredentials({ keyId, keySecret, webhookSecret })
      : previous.encryptedCredentials;
    if (!encryptedCredentials) {
      throw new HttpsError("invalid-argument", "Enter gateway credentials before saving the first permit.");
    }
    const permit = {
      enabled,
      mode,
      provider,
      displayName,
      encryptedCredentials,
      credentialFieldsConfigured: hasNewCredentials
        ? { keyId: true, keySecret: true, webhookSecret: true }
        : (previous.credentialFieldsConfigured || { keyId: true, keySecret: true, webhookSecret: true }),
      updatedAtEpochMs: now,
      updatedBy: request.auth.uid,
      revision: Number(previous.revision || 0) + 1
    };
    await db.collection("paymentGatewayPermitVersions").doc(String(permit.revision)).set(permit);
    await CONFIG_REF.set({ paymentGatewayPermit: permit }, { merge: true });
    return {
      ok: true,
      enabled,
      mode,
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
    mode: String(permit.mode || "LIVE"),
    provider: String(permit.provider || ""),
    displayName: String(permit.displayName || ""),
    credentialFieldsConfigured: permit.credentialFieldsConfigured || { keyId: false, keySecret: false, webhookSecret: false },
    updatedAtEpochMs: Number(permit.updatedAtEpochMs || 0),
    revision: Number(permit.revision || 0)
  };
});


// Provider catalog and encrypted drafts let the Owner prepare gateway details before
// an adapter is enabled. Drafts are never used by the payment flow.
const GATEWAY_PROVIDER_CATALOG = [
  { id: "RAZORPAY", name: "Razorpay", adapterImplemented: true },
  { id: "CASHFREE", name: "Cashfree", adapterImplemented: false },
  { id: "PHONEPE", name: "PhonePe", adapterImplemented: false },
  { id: "PAYU", name: "PayU", adapterImplemented: false },
  { id: "STRIPE", name: "Stripe", adapterImplemented: false },
  { id: "PAYPAL", name: "PayPal", adapterImplemented: false },
  { id: "CUSTOM", name: "Custom Gateway", adapterImplemented: false }
];

exports.getPaymentGatewayProviderCatalog = onCall(async (request) => {
  await requireOwner(request);
  const [drafts, active] = await Promise.all([
    db.collection("paymentGatewayProviderDrafts").get(),
    CONFIG_REF.get()
  ]);
  const draftByProvider = new Map(drafts.docs.map(doc => [doc.id, doc.data() || {}]));
  const activePermit = active.exists ? active.data()?.paymentGatewayPermit : null;
  return {
    providers: GATEWAY_PROVIDER_CATALOG.map(provider => {
      const draft = draftByProvider.get(provider.id) || {};
      return {
        ...provider,
        draftSaved: draft.saved === true,
        credentialsConfigured: draft.credentialConfigured === true,
        draftDisplayName: String(draft.displayName || ""),
        draftMode: String(draft.mode || "TEST"),
        draftUpdatedAtEpochMs: Number(draft.updatedAtEpochMs || 0),
        active: provider.id === String(activePermit?.provider || "") && activePermit?.enabled === true
      };
    })
  };
});

exports.savePaymentGatewayProviderDraft = onCall(
  { secrets: [gatewayEncryptionKey] },
  async (request) => {
    await requireOwner(request);
    const provider = String(request.data?.provider || "").trim().toUpperCase();
    const catalogEntry = GATEWAY_PROVIDER_CATALOG.find(item => item.id === provider);
    if (!catalogEntry) {
      throw new HttpsError("invalid-argument", "Choose a gateway from the supported provider list.");
    }
    const displayName = String(request.data?.displayName || catalogEntry.name).trim();
    const mode = String(request.data?.mode || "TEST").trim().toUpperCase();
    const rawCredentials = String(request.data?.credentialsJson || "").trim();
    if (displayName.length < 2 || displayName.length > 80) {
      throw new HttpsError("invalid-argument", "Gateway display name must be 2–80 characters.");
    }
    if (!["TEST", "LIVE"].includes(mode)) {
      throw new HttpsError("invalid-argument", "Gateway mode must be TEST or LIVE.");
    }
    if (rawCredentials.length > 16000) {
      throw new HttpsError("invalid-argument", "Gateway credentials JSON must be 16 KB or less.");
    }
    let credentials = null;
    if (rawCredentials) {
      try {
        credentials = JSON.parse(rawCredentials);
      } catch (_) {
        throw new HttpsError("invalid-argument", "Credentials must be valid JSON with provider-specific key/value fields.");
      }
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
        throw new HttpsError("invalid-argument", "Credentials must be a JSON object.");
      }
      if (Object.values(credentials).some(value => !["string", "number", "boolean"].includes(typeof value))) {
        throw new HttpsError("invalid-argument", "Credential values must be strings, numbers, or booleans.");
      }
    }
    const ref = db.collection("paymentGatewayProviderDrafts").doc(provider);
    const snap = await ref.get();
    const previous = snap.exists ? snap.data() || {} : {};
    const encryptedCredentials = credentials
      ? encryptCredentials(credentials)
      : previous.encryptedCredentials || null;
    const now = Date.now();
    const draft = {
      provider,
      displayName,
      mode,
      saved: true,
      credentialConfigured: Boolean(encryptedCredentials),
      encryptedCredentials,
      adapterImplemented: catalogEntry.adapterImplemented,
      updatedAtEpochMs: now,
      updatedBy: request.auth.uid,
      revision: Number(previous.revision || 0) + 1
    };
    await ref.set(draft);
    return {
      ok: true,
      provider,
      displayName,
      mode,
      saved: true,
      credentialConfigured: draft.credentialConfigured,
      adapterImplemented: catalogEntry.adapterImplemented,
      revision: draft.revision,
      updatedAtEpochMs: now
    };
  }
);

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
