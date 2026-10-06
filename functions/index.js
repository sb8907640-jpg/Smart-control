const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { anchorAuditRoot } = require("./blockchain-audit");

initializeApp();
const db = getFirestore();

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

  const actual = hashPin(pin, salt);
  const matches = crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex")
  );

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


function requireAdmin(request) {
  if (!request.auth || request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Firebase admin role required.");
  }
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
  const allowedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SUPPORT", "USER"]);
  const role = typeof request.data?.role === "string" ? request.data.role : "USER";

  if (action === "set") {
    if (!allowedRoles.has(role)) {
      throw new HttpsError("invalid-argument", "Unsupported user role.");
    }
    const access = request.data?.access === true;
    const expiresAtEpochMs = Number(request.data?.accessExpiresAtEpochMs || 0);
    const claims = { ...(target.customClaims || {}), role, access };
    if (role === "SUPER_ADMIN") {
      claims.admin = true;
    } else if (target.uid !== request.auth.uid) {
      delete claims.admin;
    }
    await getAuth().setCustomUserClaims(uid, claims);
    await db.collection("userAccess").doc(uid).set({
      uid,
      accessGranted: access,
      accessExpiresAtEpochMs: expiresAtEpochMs > 0 ? expiresAtEpochMs : null,
      role,
      updatedAtEpochMs: Date.now(),
      updatedBy: request.auth.uid
    }, { merge: true });
    return { ok: true };
  }

  if (action === "block" || action === "unblock") {
    if (uid === request.auth.uid && action === "block") {
      throw new HttpsError("failed-precondition", "You cannot block your own admin account.");
    }
    await getAuth().updateUser(uid, { disabled: action === "block" });
    return { ok: true, disabled: action === "block" };
  }

  throw new HttpsError("invalid-argument", "Unsupported user-management action.");
});

exports.syncOwnerAccounts = onCall(async (request) => {
  requireAdmin(request);

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

  for (const identifier of requestedIdentifiers) {
    const user = await findAuthUser(identifier);
    if (!user) {
      unresolved.push(identifier);
      continue;
    }
    const claims = { ...(user.customClaims || {}), admin: true };
    await getAuth().setCustomUserClaims(user.uid, claims);
    granted += 1;
  }

  for (const identifier of previousIdentifiers) {
    if (requestedIdentifiers.has(identifier)) continue;
    const user = await findAuthUser(identifier);
    if (!user || user.uid === request.auth.uid) continue;
    const claims = { ...(user.customClaims || {}) };
    delete claims.admin;
    await getAuth().setCustomUserClaims(user.uid, claims);
    revoked += 1;
  }

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
