const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { anchorAuditRoot } = require("./blockchain-audit");
const { ROLES, normalizeRole, canManageRole } = require("./spec/roles");

initializeApp();
const db = getFirestore();


const CURRENT_LEGAL_CONSENT_VERSION = 1;

// Record consent with server-controlled identity and a server timestamp.
exports.recordLegalConsent = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before recording consent.");
  }
  const version = Number(request.data?.version);
  if (!Number.isInteger(version) || version !== CURRENT_LEGAL_CONSENT_VERSION) {
    throw new HttpsError("failed-precondition", "The legal consent version is outdated. Review the current terms and accept again.");
  }
  const acknowledgements = ["deviceOwnerConsent", "privacyConsent", "eulaConsent"];
  if (!acknowledgements.every((key) => request.data?.[key] === true)) {
    throw new HttpsError("invalid-argument", "All required legal consent acknowledgements must be true.");
  }
  const clientAcceptedAtEpochMs = Number(request.data?.clientAcceptedAtEpochMs);
  if (!Number.isFinite(clientAcceptedAtEpochMs) || clientAcceptedAtEpochMs <= 0) {
    throw new HttpsError("invalid-argument", "A valid local acceptance timestamp is required.");
  }
  const userId = request.auth.uid;
  const ref = db.collection("consentHistory").doc(userId + "_" + version);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return { recorded: false, eventId: ref.id };
    transaction.create(ref, {
      userId,
      consentVersion: version,
      deviceOwnerConsent: true,
      privacyConsent: true,
      eulaConsent: true,
      clientAcceptedAtEpochMs,
      recordedAt: FieldValue.serverTimestamp(),
      recordedAtEpochMs: Date.now(),
      source: "ANDROID_APP"
    });
    return { recorded: true, eventId: ref.id };
  });
  return { ok: true, ...result, consentVersion: version };
});

exports.getDevicePairingPolicy = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before generating a pairing code.");
  }

  const claims = request.auth.token || {};
  const role = normalizeRole(claims.role);
  // The private allowlist is authoritative for Owner privileges; a stale ID
  // token must not preserve no-expiry pairing rights after Owner removal.
  const isOwner = role === "SUPER_ADMIN" || await configuredOwnerMatches(request);
  if (isOwner) return { isOwner: true, expiryMinutes: 0 };

  // Only expose the pairing-code lifetime, never the private owner settings document.
  const snapshot = await db.collection("ownerSettings").doc("global").get();
  const settings = snapshot.exists ? snapshot.data() || {} : {};
  const config = settings.masterConfig || {};
  const editable = config.ownerControl?.editableValues || {};
  const perUser = config.access?.perUser || {};
  const userPlan = perUser[request.auth.uid]?.planId;
  const planId = String(userPlan || editable["plans.defaultPlan"] || "free")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const planKey = `plans.${planId}PairingTokenExpiryMinutes`;
  const configured = Number(
    editable[planKey] ?? editable["plans.freePairingTokenExpiryMinutes"] ?? 10
  );
  const expiryMinutes = Number.isFinite(configured)
    ? Math.max(1, Math.min(60, Math.floor(configured)))
    : 10;
  return { isOwner: false, expiryMinutes };
});

function validatePin(pin) {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

function newSecret(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, pinHash: hashPin(pin, salt) };
}

exports.changeParentPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const pin = request.data?.pin;
  if (!validatePin(pin)) {
    throw new HttpsError("invalid-argument", "PIN must contain exactly 4 digits.");
  }
  const secret = newSecret(pin);
  await db.collection("parentSecurity").doc(request.auth.uid).set({
    ...secret,
    updatedAt: Date.now()
  });
  return { ok: true };
});

exports.verifyParentPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const parentUid = request.data?.parentUid;
  const pin = request.data?.pin;
  if (typeof parentUid !== "string" || !validatePin(pin)) {
    throw new HttpsError("invalid-argument", "Invalid verification request.");
  }

  const deviceSnap = await db.collection("devices").doc(request.auth.uid).get();
  if (!deviceSnap.exists || deviceSnap.get("controllerUid") !== parentUid) {
    throw new HttpsError("permission-denied", "Device is not paired with this controller.");
  }

  const secretSnap = await db.collection("parentSecurity").doc(parentUid).get();
  if (!secretSnap.exists) {
    throw new HttpsError("failed-precondition", "Parent PIN has not been configured.");
  }

  const salt = secretSnap.get("salt");
  const expected = secretSnap.get("pinHash");
  if (typeof salt !== "string" || typeof expected !== "string") {
    throw new HttpsError("failed-precondition", "Parent PIN configuration is invalid.");
  }

  const actualBuffer = Buffer.from(hashPin(pin, salt), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  // Corrupt or legacy records must fail closed instead of throwing a
  // RangeError from timingSafeEqual when hash lengths differ.
  const matches = actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);

  return { ok: matches };
});


exports.stopSessionWithPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const pin = request.data?.pin;
  if (!validatePin(pin)) {
    throw new HttpsError("invalid-argument", "PIN must contain exactly 4 digits.");
  }

  const deviceSnap = await db.collection("devices").doc(request.auth.uid).get();
  if (!deviceSnap.exists) {
    throw new HttpsError("permission-denied", "Device is not paired.");
  }

  const parentUid = deviceSnap.get("controllerUid");
  if (typeof parentUid !== "string") {
    throw new HttpsError("permission-denied", "No controller is paired.");
  }

  const secretSnap = await db.collection("parentSecurity").doc(parentUid).get();
  if (!secretSnap.exists) {
    throw new HttpsError("failed-precondition", "Parent PIN has not been configured.");
  }

  const salt = secretSnap.get("salt");
  const expected = secretSnap.get("pinHash");
  if (typeof salt !== "string" || typeof expected !== "string") {
    throw new HttpsError("failed-precondition", "Parent PIN configuration is invalid.");
  }

  const actual = hashPin(pin, salt);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, stoppedCount: 0 };
  }

  const snapshot = await db.collection("mediaSessions")
    .where("targetDeviceId", "==", request.auth.uid)
    .where("controllerUid", "==", parentUid)
    .where("status", "in", ["REQUESTED", "APPROVED", "ACTIVE"])
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.update(doc.ref, {
    status: "STOPPED",
    stoppedAt: Date.now(),
    stoppedBy: request.auth.uid
  }));
  if (!snapshot.empty) await batch.commit();

  return { ok: true, stoppedCount: snapshot.size };
});


async function requireAdmin(request) {
  if (!request.auth || request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Firebase admin role required.");
  }
  // Custom claims are embedded in ID tokens and can remain stale after an
  // Owner is removed. Confirm the current server-side claim before privileged work.
  let currentUser;
  try {
    currentUser = await getAuth().getUser(request.auth.uid);
  } catch (_) {
    throw new HttpsError("permission-denied", "Firebase admin role required.");
  }
  const currentClaims = currentUser.customClaims || {};
  if (currentUser.disabled || currentClaims.admin !== true) {
    throw new HttpsError("permission-denied", "Firebase admin role is no longer active.");
  }
  const currentRole = normalizeRole(currentClaims.role);
  if ((currentRole === "OWNER" || currentClaims.owner === true) &&
      !await configuredOwnerMatches(request)) {
    throw new HttpsError("permission-denied", "Owner access is no longer active.");
  }
}

async function configuredOwnerMatches(request) {
  if (!request.auth) return false;
  const claims = request.auth.token || {};
  const email = String(claims.email || "").trim().toLowerCase();
  const phone = String(claims.phone_number || "").trim();
  const snap = await db.collection("ownerAccounts").doc("config").get();
  if (!snap.exists) {
    // Allow a deployment-provisioned OWNER claim to seed the first allowlist.
    // Once the config exists, the live list becomes authoritative for revocation.
    return claims.owner === true || normalizeRole(claims.role) === "OWNER";
  }
  const cfg = snap.data() || {};
  const emails = Array.isArray(cfg.emails)
    ? cfg.emails.map(value => String(value).trim().toLowerCase())
    : [];
  const mobiles = Array.isArray(cfg.mobiles)
    ? cfg.mobiles.map(value => String(value).trim())
    : [];
  return Boolean((email && emails.includes(email)) || (phone && mobiles.includes(phone)));
}

async function requireOwnerOrSuperAdmin(request) {
  await requireAdmin(request);
  const claims = request.auth.token || {};
  const role = normalizeRole(claims.role);
  if (role === "SUPER_ADMIN" || await configuredOwnerMatches(request)) {
    return;
  }
  throw new HttpsError("permission-denied", "Only a configured Owner or Super Admin may manage owner accounts.");
}

async function effectiveActorRole(request) {
  const claims = request.auth?.token || {};
  const role = normalizeRole(claims.role);
  if (role === "SUPER_ADMIN") return role;
  if (await configuredOwnerMatches(request)) return "OWNER";
  // OWNER claims may remain in a cached ID token after allowlist removal.
  if (role === "OWNER" || claims.owner === true) return "USER";
  return role;
}

async function findAuthUser(identifier) {
  try {
    if (identifier.includes("@")) return await getAuth().getUserByEmail(identifier);
    if (identifier.startsWith("+")) return await getAuth().getUserByPhoneNumber(identifier);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
  return null;
}

exports.listOwnerUsers = onCall(async (request) => {
  await requireAdmin(request);
  const result = [];
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    page.users.forEach((user) => {
      const claims = user.customClaims || {};
      result.push({
        uid: user.uid,
        displayName: user.displayName || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        disabled: Boolean(user.disabled),
        role: typeof claims.role === "string" ? claims.role : "USER",
        admin: claims.admin === true
      });
    });
    pageToken = page.pageToken;
  } while (pageToken);
  const accessSnapshots = await Promise.all(
    result.map((user) => db.collection("userAccess").doc(user.uid).get())
  );
  result.forEach((user, index) => {
    const accessData = accessSnapshots[index].exists ? accessSnapshots[index].data() : {};
    user.accessGranted = accessData.accessGranted === true;
    user.accessExpiresAtEpochMs = Number(accessData.accessExpiresAtEpochMs || 0) || null;
  });
  return { users: result };
});

exports.updateOwnerUser = onCall(async (request) => {
  await requireAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");

  const target = await getAuth().getUser(uid);
  const action = typeof request.data?.action === "string" ? request.data.action : "set";
  const role = normalizeRole(request.data?.role);
  if (typeof request.data?.role === "string" && !ROLES.includes(request.data.role.trim().toUpperCase())) {
    throw new HttpsError("invalid-argument", "Unsupported user role.");
  }
  const actorRole = await effectiveActorRole(request);
  if (action === "set") {
    // A user may not change their own role, and role assignments must obey the
    // hierarchy. OWNER is managed only through the verified allowlist sync path.
    const existingTargetRole = normalizeRole(target.customClaims?.role);
    if (uid === request.auth.uid && role !== actorRole) {
      throw new HttpsError("permission-denied", "You cannot change your own role.");
    }
    if (uid !== request.auth.uid && existingTargetRole === "OWNER" && role !== "OWNER") {
      throw new HttpsError("permission-denied", "Owner roles must be changed through the Owner allowlist.");
    }
    if (uid !== request.auth.uid && actorRole !== "SUPER_ADMIN" &&
        !canManageRole(actorRole, existingTargetRole)) {
      throw new HttpsError("permission-denied", "Insufficient authority over the target account's current role.");
    }
    if (uid !== request.auth.uid && !canManageRole(actorRole, role)) {
      throw new HttpsError("permission-denied", "Insufficient role authority.");
    }
  } else if (action === "block" || action === "unblock") {
    const targetRole = normalizeRole(target.customClaims?.role);
    if (uid !== request.auth.uid &&
        actorRole !== "SUPER_ADMIN" &&
        !canManageRole(actorRole, targetRole)) {
      throw new HttpsError("permission-denied", "Insufficient role authority to block or unblock this account.");
    }
  } else {
    throw new HttpsError("invalid-argument", "Unsupported user-management action.");
  }

  if (action === "set") {
    const access = request.data?.access === true;
    const expiresAtEpochMs = Number(request.data?.accessExpiresAtEpochMs || 0);
    const claims = { ...(target.customClaims || {}), role, access };
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      claims.admin = true;
    } else if (target.uid !== request.auth.uid) {
      delete claims.admin;
    }
    await getAuth().setCustomUserClaims(uid, claims);
    const updatedAtEpochMs = Date.now();
    await db.collection("userAccess").doc(uid).set({
      uid,
      accessGranted: access,
      accessExpiresAtEpochMs: expiresAtEpochMs > 0 ? expiresAtEpochMs : null,
      role,
      updatedAtEpochMs,
      updatedBy: request.auth.uid
    }, { merge: true });
    await db.collection("featurePolicyUsers").doc(uid).set({
      enabled: access && (expiresAtEpochMs <= 0 || expiresAtEpochMs > updatedAtEpochMs),
      expiresAtEpochMs: expiresAtEpochMs > 0 ? expiresAtEpochMs : null,
      role,
      blocked: false,
      updatedAtEpochMs,
      updatedBy: request.auth.uid
    }, { merge: true });
    return { ok: true };
  }

  if (action === "block" || action === "unblock") {
    if (uid === request.auth.uid && action === "block") {
      throw new HttpsError("failed-precondition", "You cannot block your own admin account.");
    }
    const disabled = action === "block";
    await getAuth().updateUser(uid, { disabled });
    const updatedAtEpochMs = Date.now();
    if (disabled) {
      await db.collection("featurePolicyUsers").doc(uid).set({
        enabled: false,
        blocked: true,
        updatedAtEpochMs,
        updatedBy: request.auth.uid
      }, { merge: true });
    } else {
      const accessSnapshot = await db.collection("userAccess").doc(uid).get();
      const accessData = accessSnapshot.exists ? accessSnapshot.data() : {};
      const accessGranted = accessData.accessGranted === true;
      const expiresAtEpochMs = Number(accessData.accessExpiresAtEpochMs || 0);
      await db.collection("featurePolicyUsers").doc(uid).set({
        enabled: accessGranted && (expiresAtEpochMs <= 0 || expiresAtEpochMs > updatedAtEpochMs),
        expiresAtEpochMs: expiresAtEpochMs > 0 ? expiresAtEpochMs : null,
        blocked: false,
        updatedAtEpochMs,
        updatedBy: request.auth.uid
      }, { merge: true });
    }
    return { ok: true, disabled };
  }

  throw new HttpsError("invalid-argument", "Unsupported user-management action.");
});

exports.syncOwnerAccounts = onCall(async (request) => {
  await requireOwnerOrSuperAdmin(request);

  const emails = Array.isArray(request.data?.emails)
    ? request.data.emails.map(String).map(v => v.trim().toLowerCase()).filter(Boolean)
    : [];
  const mobiles = Array.isArray(request.data?.mobiles)
    ? request.data.mobiles.map(String).map(v => v.trim()).filter(Boolean)
    : [];

  const requestedIdentifiers = new Set([...emails, ...mobiles]);
  if (requestedIdentifiers.size === 0) {
    throw new HttpsError("invalid-argument", "At least one owner email or mobile is required.");
  }

  const currentProfile = await db.collection("ownerAccounts").doc("config").get();
  const previous = currentProfile.exists ? currentProfile.data() : {};
  const previousIdentifiers = new Set([
    ...(Array.isArray(previous.emails) ? previous.emails.map(String).map(v => v.trim().toLowerCase()) : []),
    ...(Array.isArray(previous.mobiles) ? previous.mobiles.map(String).map(v => v.trim()) : [])
  ]);

  let granted = 0;
  let revoked = 0;
  const unresolved = [];
  const resolvedUsers = new Map();

  // Resolve every requested identity before changing any claims or allowlist
  // data. A partially valid list must not revoke existing owners on a failed save.
  for (const identifier of requestedIdentifiers) {
    const user = await findAuthUser(identifier);
    if (!user) unresolved.push(identifier);
    else resolvedUsers.set(identifier, user);
  }
  if (unresolved.length > 0) {
    return { ok: false, granted: 0, revoked: 0, unresolved };
  }

  for (const identifier of requestedIdentifiers) {
    const user = resolvedUsers.get(identifier);
    const claims = { ...(user.customClaims || {}) };
    const currentRole = normalizeRole(claims.role);
    claims.admin = true;
    claims.owner = true;
    claims.role = currentRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "OWNER";
    await getAuth().setCustomUserClaims(user.uid, claims);
    granted += 1;
  }

  for (const identifier of previousIdentifiers) {
    if (requestedIdentifiers.has(identifier)) continue;
    const user = await findAuthUser(identifier);
    if (!user) continue;
    const claims = { ...(user.customClaims || {}) };
    const currentRole = normalizeRole(claims.role);
    delete claims.owner;
    if (currentRole === "SUPER_ADMIN") {
      // Do not demote a separately assigned Super Admin when removing an Owner
      // allowlist entry.
      claims.admin = true;
    } else {
      delete claims.admin;
      if (currentRole === "OWNER") claims.role = "USER";
    }
    await getAuth().setCustomUserClaims(user.uid, claims);
    revoked += 1;
  }

  // Persist the configured owner identifiers. Gateway ownership checks and
  // future revocation runs read this document, so updating claims alone is not
  // sufficient.
  await db.collection("ownerAccounts").doc("config").set({
    emails: [...new Set(emails)],
    mobiles: [...new Set(mobiles)],
    updatedAtEpochMs: Date.now(),
    updatedBy: request.auth.uid
  }, { merge: true });

  return { ok: true, granted, revoked, unresolved };
});


exports.anchorAuditRoot = require("firebase-functions/v2/https").onCall(async (request) => {
  await requireAdmin(request);
  const root = typeof request.data?.root === "string" ? request.data.root : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(root)) {
    throw new HttpsError("invalid-argument", "A 32-byte audit root is required.");
  }
  try {
    return await anchorAuditRoot(root);
  } catch (error) {
    throw new HttpsError("failed-precondition", error.message);
  }
});

// Billing and payment lifecycle exports.
Object.assign(exports, require("./billing"));
const gatewayPermitFunctions = require("./gateway-permit");
exports.savePaymentGatewayPermit = gatewayPermitFunctions.savePaymentGatewayPermit;
exports.getPaymentGatewayPermit = gatewayPermitFunctions.getPaymentGatewayPermit;
exports.getPaymentGatewayProviderCatalog = gatewayPermitFunctions.getPaymentGatewayProviderCatalog;
exports.savePaymentGatewayProviderDraft = gatewayPermitFunctions.savePaymentGatewayProviderDraft;
Object.assign(exports, require("./ice-servers"));


exports.detectConsentAnomaly = onDocumentCreated("auditLogs/{eventId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const eventData = snapshot.data();
  const userId = typeof eventData.userId === "string" ? eventData.userId : "";
  const deviceId = typeof eventData.deviceId === "string" ? eventData.deviceId : "";
  const createdAt = Number(eventData.createdAt || Date.now());
  if (!userId || !deviceId) return;

  const windowStart = createdAt - 60_000;
  const recent = await db.collection("auditLogs")
    .where("userId", "==", userId)
    .where("deviceId", "==", deviceId)
    .where("createdAt", ">=", windowStart)
    .orderBy("createdAt", "desc")
    .limit(51)
    .get();

  const distinctActions = new Set(
    recent.docs.map(doc => String(doc.data().action || "")).filter(Boolean)
  );
  const burst = recent.size > 20;
  const actionSpread = recent.size >= 10 && distinctActions.size >= 8;
  if (!burst && !actionSpread) return;

  const anomalyId = crypto
    .createHash("sha256")
    .update([userId, deviceId, String(Math.floor(createdAt / 60_000))].join(":"))
    .digest("hex");

  await db.collection("anomalyAlerts").doc(anomalyId).set({
    userId,
    deviceId,
    type: burst ? "AUDIT_BURST" : "UNUSUAL_ACTION_SPREAD",
    severity: burst ? "HIGH" : "MEDIUM",
    eventCount: recent.size,
    distinctActions: distinctActions.size,
    windowStart,
    windowEnd: createdAt,
    createdAt: Date.now()
  }, { merge: true });
});
