const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { anchorAuditRoot } = require("./blockchain-audit");
const { ROLES, normalizeRole, canManageUser, canManageOwnerAccounts } = require("./spec/roles");
const { mediaCapabilitiesAllowed } = require("./spec/media-policy");

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
  if (canManageOwnerAccounts(claims)) return { isOwner: true, expiryMinutes: 0 };

  const ownerAccountsSnapshot = await db.collection("ownerAccounts").doc("config").get();
  const ownerAccounts = ownerAccountsSnapshot.exists ? ownerAccountsSnapshot.data() || {} : {};
  const ownerEmails = Array.isArray(ownerAccounts.emails) ? ownerAccounts.emails : [];
  const ownerMobiles = Array.isArray(ownerAccounts.mobiles) ? ownerAccounts.mobiles : [];
  const isOwner = canManageOwnerAccounts(claims, ownerEmails, ownerMobiles);
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

exports.approveMediaSession = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before approving a media session.");
  }
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid media session ID is required.");
  }

  const sessionRef = db.collection("mediaSessions").doc(sessionId);
  const globalPolicyRef = db.collection("featurePolicy").doc("global");
  const userPolicyRef = db.collection("featurePolicyUsers").doc(request.auth.uid);
  return db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) throw new HttpsError("not-found", "Media session not found.");
    const session = sessionSnapshot.data() || {};
    if (session.targetDeviceId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the receiving device can approve this session.");
    }
    if (session.status !== "REQUESTED") {
      throw new HttpsError("failed-precondition", "This session is no longer awaiting approval.");
    }

    const deviceSnapshot = await transaction.get(db.collection("devices").doc(session.targetDeviceId));
    const device = deviceSnapshot.exists ? deviceSnapshot.data() || {} : {};
    if (!deviceSnapshot.exists || device.controllerUid !== session.controllerUid || device.pairingActive !== true) {
      throw new HttpsError("failed-precondition", "The device pairing is no longer active.");
    }

    const globalPolicySnapshot = await transaction.get(globalPolicyRef);
    const userPolicySnapshot = await transaction.get(userPolicyRef);
    const userPolicy = userPolicySnapshot.exists ? userPolicySnapshot.data() || {} : null;
    if (!globalPolicySnapshot.exists || !mediaCapabilitiesAllowed(
      session.capabilities,
      globalPolicySnapshot.data() || {},
      userPolicy
    )) {
      throw new HttpsError("permission-denied", "Owner feature policy does not allow one or more requested capabilities.");
    }

    const approvedAtEpochMs = Date.now();
    transaction.update(sessionRef, {
      status: "APPROVED",
      approvedAtEpochMs,
      approvedByUid: request.auth.uid
    });
    return { ok: true, sessionId, status: "APPROVED", approvedAtEpochMs };
  });
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

const PARENT_PIN_MAX_ATTEMPTS = 5;
const PARENT_PIN_WINDOW_MS = 15 * 60 * 1000;

function parentPinAttemptRef(parentUid, requesterUid) {
  return db.collection("parentPinAttempts").doc(parentUid + "_" + requesterUid);
}

async function consumeParentPinAttempt(parentUid, requesterUid) {
  const ref = parentPinAttemptRef(parentUid, requesterUid);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const startedAt = Number(snapshot.get("windowStartedAtEpochMs") || 0);
    const expired = !startedAt || now - startedAt >= PARENT_PIN_WINDOW_MS;
    const windowStartedAtEpochMs = expired ? now : startedAt;
    const attempts = expired ? 0 : Number(snapshot.get("attempts") || 0);
    if (attempts >= PARENT_PIN_MAX_ATTEMPTS) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many PIN attempts. Try again in 15 minutes."
      );
    }
    transaction.set(ref, {
      parentUid,
      requesterUid,
      attempts: attempts + 1,
      windowStartedAtEpochMs,
      updatedAtEpochMs: now
    }, { merge: true });
  });
}

async function clearParentPinAttempts(parentUid, requesterUid) {
  await parentPinAttemptRef(parentUid, requesterUid).delete();
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

  await consumeParentPinAttempt(parentUid, request.auth.uid);
  const actual = hashPin(pin, salt);
  const matches = crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex")
  );
  if (matches) await clearParentPinAttempts(parentUid, request.auth.uid);

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

  await consumeParentPinAttempt(parentUid, request.auth.uid);
  const actual = hashPin(pin, salt);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, stoppedCount: 0 };
  }
  await clearParentPinAttempts(parentUid, request.auth.uid);

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


function requireAdmin(request) {
  if (!request.auth || request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Firebase admin role required.");
  }
}

async function requireOwnerAccountManager(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const claims = request.auth.token || {};
  const snapshot = await db.collection("ownerAccounts").doc("config").get();
  const config = snapshot.exists ? snapshot.data() || {} : {};
  const emails = Array.isArray(config.emails) ? config.emails : [];
  const mobiles = Array.isArray(config.mobiles) ? config.mobiles : [];
  if (canManageOwnerAccounts(claims, emails, mobiles)) return;
  throw new HttpsError("permission-denied", "Only a configured Owner or Super Admin can manage Owner Accounts.");
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
  requireAdmin(request);
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
  requireAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");

  const target = await getAuth().getUser(uid);
  const action = typeof request.data?.action === "string" ? request.data.action : "set";
  if (action === "set" && typeof request.data?.role !== "string") {
    throw new HttpsError("invalid-argument", "A target role is required.");
  }
  const role = normalizeRole(request.data?.role);
  if (typeof request.data?.role === "string" && !ROLES.includes(request.data.role.trim().toUpperCase())) {
    throw new HttpsError("invalid-argument", "Unsupported user role.");
  }
  const actorRole = normalizeRole(request.auth.token?.role);
  const currentTargetRole = normalizeRole(target.customClaims?.role);
  if (!canManageUser(
    request.auth.uid,
    uid,
    actorRole,
    currentTargetRole,
    action === "set" ? role : null
  )) {
    if (uid === request.auth.uid) {
      throw new HttpsError("failed-precondition", "You cannot change your own role or access through this endpoint.");
    }
    throw new HttpsError("permission-denied", "Insufficient role authority for the target account or requested role.");
  }

  if (action === "set") {
    const access = request.data?.access === true;
    const rawExpiry = request.data?.accessExpiresAtEpochMs;
    const expiresAtEpochMs = rawExpiry == null || rawExpiry === "" ? 0 : Number(rawExpiry);
    if (!Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs < 0) {
      throw new HttpsError("invalid-argument", "Access expiry must be a non-negative epoch-millisecond integer.");
    }
    if (access && expiresAtEpochMs > 0 && expiresAtEpochMs <= Date.now()) {
      throw new HttpsError("invalid-argument", "Access expiry must be in the future.");
    }
    const claims = { ...(target.customClaims || {}), role, access };
    if (role === "SUPER_ADMIN") {
      claims.admin = true;
      delete claims.owner;
    } else if (role === "OWNER") {
      claims.admin = true;
      claims.owner = true;
    } else {
      delete claims.admin;
      delete claims.owner;
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
  await requireOwnerAccountManager(request);

  const requestedEmails = new Set(
    (Array.isArray(request.data?.emails) ? request.data.emails : [])
      .map(value => String(value).trim().toLowerCase())
      .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  );
  const requestedMobiles = new Set(
    (Array.isArray(request.data?.mobiles) ? request.data.mobiles : [])
      .map(value => String(value).trim())
      .filter(value => /^\+[1-9]\d{7,14}$/.test(value))
  );
  if (requestedEmails.size === 0 && requestedMobiles.size === 0) {
    throw new HttpsError("invalid-argument", "Provide at least one valid owner email or E.164 mobile number.");
  }

  const currentProfile = await db.collection("ownerAccounts").doc("config").get();
  const previous = currentProfile.exists ? currentProfile.data() || {} : {};
  const previousIdentifiers = new Set([
    ...(Array.isArray(previous.emails) ? previous.emails.map(String).map(value => value.trim().toLowerCase()) : []),
    ...(Array.isArray(previous.mobiles) ? previous.mobiles.map(String).map(value => value.trim()) : [])
  ]);

  const unresolved = [];
  const resolvedUsers = new Map();
  const resolvedEmails = new Set();
  const resolvedMobiles = new Set();
  const resolvedIdentifiers = new Set();

  for (const email of requestedEmails) {
    const user = await findAuthUser(email);
    // An unverified email must never become an Owner allowlist identity.
    if (!user || user.emailVerified !== true || !user.email) {
      unresolved.push(email);
      continue;
    }
    const canonicalEmail = user.email.trim().toLowerCase();
    resolvedEmails.add(canonicalEmail);
    resolvedIdentifiers.add(canonicalEmail);
    resolvedUsers.set(user.uid, user);
  }

  for (const mobile of requestedMobiles) {
    const user = await findAuthUser(mobile);
    if (!user || !user.phoneNumber) {
      unresolved.push(mobile);
      continue;
    }
    const canonicalMobile = user.phoneNumber.trim();
    resolvedMobiles.add(canonicalMobile);
    resolvedIdentifiers.add(canonicalMobile);
    resolvedUsers.set(user.uid, user);
  }

  if (resolvedIdentifiers.size === 0) {
    throw new HttpsError("failed-precondition", "No valid, existing, verified Owner account was found; existing configuration was left unchanged.");
  }

  let granted = 0;
  let revoked = 0;
  for (const user of resolvedUsers.values()) {
    const claims = { ...(user.customClaims || {}), admin: true };
    await getAuth().setCustomUserClaims(user.uid, claims);
    granted += 1;
  }

  for (const identifier of previousIdentifiers) {
    if (resolvedIdentifiers.has(identifier)) continue;
    const user = await findAuthUser(identifier);
    if (!user) continue;
    if (user.uid === request.auth.uid) {
      const actorClaims = request.auth.token || {};
      const actorRole = normalizeRole(actorClaims.role);
      // Preserve role-based Owners/Super Admins, but revoke a removed email/mobile
      // allowlist account's generic admin claim instead of leaving stale access behind.
      if (actorClaims.owner === true || actorRole === "OWNER" || actorRole === "SUPER_ADMIN") {
        continue;
      }
    }
    const claims = { ...(user.customClaims || {}) };
    const currentRole = normalizeRole(claims.role);
    if (currentRole === "SUPER_ADMIN") continue;
    delete claims.admin;
    delete claims.owner;
    if (currentRole === "OWNER") claims.role = "USER";
    await getAuth().setCustomUserClaims(user.uid, claims);
    revoked += 1;
  }

  await db.collection("ownerAccounts").doc("config").set({
    emails: [...resolvedEmails],
    mobiles: [...resolvedMobiles],
    updatedAtEpochMs: Date.now(),
    updatedBy: request.auth.uid
  });

  return { ok: true, granted, revoked, unresolved };
});


exports.anchorAuditRoot = require("firebase-functions/v2/https").onCall(async (request) => {
  requireAdmin(request);
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
