const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

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
