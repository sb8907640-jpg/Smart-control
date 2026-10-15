const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createPool: createPostgresPool, checkPostgres } = require("./postgres");
const { installPostgresRoutes } = require("./postgres-api");
const { getResidencyPolicy } = require("./data-residency");
const { installCatalogRoutes } = require("./catalog-api");
const { applyOwnerRole } = require("./owner-auth");
const { installOwnerPanelRoutes } = require("./owner-panel");

function resolvePublicAppUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") {
      return null;
    }
    return url.origin;
  } catch (_) {
    return null;
  }
}

function createApp({ verifyIdToken, db, auth, postgres, postgresPool } = {}) {
  const app = express();
  const allowedOrigins = String(process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  const sensitiveRemoteConfigKey = /(?:secret|pass(?:word|wd)?|private|credential|webhook|(?:access|refresh|id|auth|bearer)?[_-]?token|(?:api|client|service)[_-]?key|signing[_-]?key|encryption[_-]?key|service[_-]?account|turn[_-]?server)/i;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      // Non-browser clients may omit Origin. Browser origins must be explicitly
      // allowlisted; an unset CORS_ORIGIN must never silently allow every site.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin is not allowed."));
    },
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    const residency = getResidencyPolicy();
    const ok = !residency.failClosed;
    return res.status(ok ? 200 : 503).json({
      ok,
      service: "smart-control-backend",
      residency: residency.region,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/readyz", async (_req, res) => {
    const residency = getResidencyPolicy();
    const checks = { firebase: Boolean(db), postgres: !process.env.DATABASE_URL, residency: !residency.failClosed };
    let pool = null;
    if (process.env.DATABASE_URL) {
      try {
        const { createPool, checkDatabase } = require("./db");
        pool = createPool();
        await checkDatabase(pool);
        checks.postgres = true;
      } catch (_) {
        checks.postgres = false;
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    }
    const ok = checks.firebase && checks.postgres && checks.residency;
    res.status(ok ? 200 : 503).json({ ok, checks });
  });



  const authenticate = async (req, res, next) => {
    const header = String(req.get("authorization") || "");
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required." });
    if (typeof verifyIdToken !== "function") return res.status(503).json({ error: "Authentication service is unavailable." });
    let verifiedUser;
    try {
      verifiedUser = await verifyIdToken(header.slice(7), true);
    } catch (_) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }
    req.user = applyOwnerRole(verifiedUser);

    // Owner Accounts is the server-managed allowlist shared with Firebase Functions.
    // Resolve it for admin-claim accounts so a newly configured Owner is recognized
    // consistently by the web Owner panel without trusting a client-supplied role.
    const currentRole = String(req.user?.role || "").toUpperCase();
    if (db && req.user?.admin === true && req.user.owner !== true &&
        currentRole !== "OWNER" && currentRole !== "SUPER_ADMIN") {
      try {
        const ownerConfigSnap = await db.collection("ownerAccounts").doc("config").get();
        const ownerConfig = ownerConfigSnap.exists ? ownerConfigSnap.data() || {} : {};
        const email = String(req.user.email || "").trim().toLowerCase();
        const phone = String(req.user.phone_number || req.user.phoneNumber || "").trim();
        const ownerEmails = Array.isArray(ownerConfig.emails)
          ? ownerConfig.emails.map(value => String(value).trim().toLowerCase())
          : [];
        const ownerMobiles = Array.isArray(ownerConfig.mobiles)
          ? ownerConfig.mobiles.map(value => String(value).trim())
          : [];
        if ((email && ownerEmails.includes(email)) || (phone && ownerMobiles.includes(phone))) {
          req.user = { ...req.user, role: "OWNER", owner: true, admin: true };
        }
      } catch (_) {
        // Never infer Owner authority from a failed allowlist lookup.
      }
    }

    // Owner suspend/block controls must be enforced by the server, not just
    // displayed in the UI. Missing user profiles remain compatible with older
    // installations; a configured Firestore status lookup failure fails closed.
    if (db && typeof db.collection === "function" && req.user?.uid) {
      try {
        const [account, access] = await Promise.all([
          db.collection("users").doc(req.user.uid).get(),
          db.collection("userAccess").doc(req.user.uid).get()
        ]);
        const accountStatus = String(account.exists ? account.data()?.status || "ACTIVE" : "ACTIVE").toUpperCase();
        const accessBlocked = access.exists && access.data()?.blocked === true;
        if (["SUSPENDED", "BLOCKED", "BANNED", "DISABLED"].includes(accountStatus) || accessBlocked) {
          const blockReason = accessBlocked ? "OWNER_BLOCKED" : accountStatus;
          try {
            await db.collection("securityEvents").add({
              event: "AUTH_REJECTED_ACCOUNT_STATUS",
              userId: req.user.uid,
              status: blockReason,
              createdAtEpochMs: Date.now()
            });
          } catch (_) {
            // Do not allow a secondary audit-store failure to bypass the block.
          }
          return res.status(403).json({ error: "This account is suspended or blocked. Contact support if you believe this is an error." });
        }
      } catch (_) {
        return res.status(503).json({ error: "Account status could not be verified. Please try again later." });
      }
    }
    return next();
  };

  app.get("/api/system/residency", authenticate, (_req, res) => res.json(getResidencyPolicy()));

  const firestore = db;
  const requireFirestore = (_req, res, next) => {
    if (!firestore) return res.status(503).json({ error: "Data service is unavailable." });
    next();
  };

  if (postgresPool) installPostgresRoutes(app, { pool: postgresPool, authenticate });

  app.get("/api/config", authenticate, async (_req, res, next) => {
    try {
      const { getRemoteConfig } = require("firebase-admin/remote-config");
      const template = await getRemoteConfig().getTemplate();
      const values = {};
      for (const [key, parameter] of Object.entries(template.parameters || {})) {
        if (sensitiveRemoteConfigKey.test(key)) continue;
        const v = parameter.defaultValue;
        values[key] = v?.value ?? null;
      }
      res.json({ values, etag: template.etag || null, fetchedAt: new Date().toISOString() });
    } catch (error) { next(error); }
  });

  app.put("/api/config", authenticate, async (req, res, next) => {
    if (req.user.admin !== true) return res.status(403).json({ error: "Administrator access required." });
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ error: "values object is required." });
      const { getRemoteConfig } = require("firebase-admin/remote-config");
      const remoteConfig = getRemoteConfig();
      const template = await remoteConfig.getTemplate();
      for (const [key, value] of Object.entries(values)) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(key)) return res.status(400).json({ error: "Invalid Remote Config key." });
        if (sensitiveRemoteConfigKey.test(key)) return res.status(400).json({ error: "Secret or credential values must not be stored in Remote Config." });
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return res.status(400).json({ error: "Remote Config values must be scalar." });
        template.parameters[key] = { defaultValue: { value: String(value) } };
      }
      const updated = await remoteConfig.publishTemplate(template);
      res.json({ ok: true, etag: updated.etag || null });
    } catch (error) { next(error); }
  });

  app.get("/api/auth/session", authenticate, (req, res) => {
    res.json({
      authenticated: true,
      uid: req.user.uid,
      email: req.user.email || null,
      phoneNumber: req.user.phone_number || null,
      admin: req.user.admin === true,
      owner: req.user.owner === true,
      role: req.user.role || null
    });
  });

  app.post("/api/notifications/register", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const token = String(req.body?.token || "");
      if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: "Invalid FCM token." });
      await firestore.collection("fcmTokens").doc(req.user.uid).collection("tokens").doc(Buffer.from(token).toString("base64url").slice(0, 128)).set({
        token, platform: String(req.body?.platform || "unknown").slice(0, 32),
        updatedAtEpochMs: Date.now()
      }, { merge: true });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get("/api/system/status", authenticate, async (_req, res) => {
    let firestoreStatus = "unconfigured";
    let postgresStatus = { configured: false, ok: false };
    try { postgresStatus = await checkPostgres(postgres); } catch (_) { postgresStatus = { configured: true, ok: false }; }
    if (firestore) {
      try {
        await firestore.collection("systemStatus").doc("health").get();
        firestoreStatus = "ok";
      } catch (_) {
        firestoreStatus = "error";
      }
    }
    const firestoreOk = firestoreStatus === "ok";
    const postgresOk = postgresStatus.configured !== true || postgresStatus.ok === true;
    res.json({
      ok: firestoreOk && postgresOk,
      service: "smart-control-backend",
      firestore: firestoreStatus,
      postgres: postgresStatus
    });
  });

  app.post("/api/notifications/send", authenticate, requireFirestore, async (req, res, next) => {
    if (req.user.admin !== true) return res.status(403).json({ error: "Administrator access required." });
    try {
      const uid = String(req.body?.uid || "");
      const title = String(req.body?.title || "").trim().slice(0, 120);
      const body = String(req.body?.body || "").trim().slice(0, 1000);
      if (!uid || !title || !body) return res.status(400).json({ error: "uid, title and body are required." });
      const snap = await firestore.collection("fcmTokens").doc(uid).collection("tokens").limit(500).get();
      const tokens = snap.docs.map(d => d.data().token).filter(Boolean);
      if (!tokens.length) return res.status(404).json({ error: "No registered FCM tokens." });
      const { getMessaging } = require("firebase-admin/messaging");
      // Use data-only messages so the Android client can verify the signed-in UID
      // before displaying notification content. A stale token on a shared device
      // must not let a previous account's message appear under a different account.
      const result = await getMessaging().sendEachForMulticast({
        tokens,
        data: { source: "smart-control-backend", targetUid: uid, title, body },
        android: { priority: "high" }
      });
      const invalidCodes = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]);
      const cleanup = [];
      result.responses.forEach((response, index) => {
        if (!response.success && invalidCodes.has(response.error?.code)) {
          cleanup.push(snap.docs[index].ref.delete());
        }
      });
      await Promise.allSettled(cleanup);
      res.json({ successCount: result.successCount, failureCount: result.failureCount, cleanedInvalidTokens: cleanup.length });
    } catch (error) { next(error); }
  });

  app.get("/api/plans", authenticate, requireFirestore, async (_req, res, next) => {
    try {
      const snap = await firestore.collection("plans").where("enabled", "==", true).orderBy("displayOrder", "asc").limit(100).get();
      res.json({ plans: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    } catch (error) { next(error); }
  });

  app.get("/api/plans/:id", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const snap = await firestore.collection("plans").doc(req.params.id).get();
      if (!snap.exists || snap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      res.json({ plan: { id: snap.id, ...snap.data() } });
    } catch (error) { next(error); }
  });

  app.get("/api/devices", authenticate, async (req, res, next) => {
    try {
      const firestoreAvailable = firestore && typeof firestore.collection === "function";
      if (!postgres && !firestoreAvailable) return res.status(503).json({ error: "Data service is unavailable." });
      const devicesById = new Map();

      // PostgreSQL device registrations are supplemental. The authenticated
      // Firestore pairing document remains canonical for Android media/file flows.
      if (postgres) {
        const rows = await postgres.listDevices(req.user.uid);
        for (const row of rows) {
          const id = String(row.device_key || row.id || "").trim();
          if (!id) continue;
          devicesById.set(id, {
            id,
            name: String(row.name || ("Device " + id.slice(0, 8))),
            ...(typeof row.platform === "string" ? { platform: row.platform } : {}),
            status: "REGISTERED"
          });
        }
      }

      if (firestoreAvailable) {
        const snap = await firestore.collection("devices")
          .where("controllerUid", "==", req.user.uid)
          .where("pairingActive", "==", true)
          .limit(100)
          .get();
        for (const doc of snap.docs) {
          const data = doc.data() || {};
          const serviceAlive = data.health?.serviceAlive;
          devicesById.set(doc.id, {
            id: doc.id,
            name: String(data.name || data.deviceName || ("Device " + doc.id.slice(0, 8))),
            ...(typeof data.platform === "string" ? { platform: data.platform } : {}),
            status: serviceAlive === true ? "ONLINE" : serviceAlive === false ? "OFFLINE" : "PAIRED"
          });
        }
      }
      return res.json({ devices: [...devicesById.values()].slice(0, 100) });
    } catch (error) { next(error); }
  });



  // Authenticated customer support entry point. The destination and message are
  // resolved server-side from the private Owner business profile.
  app.post("/api/support/whatsapp/initiate", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const settingsSnap = await firestore.collection("ownerSettings").doc("global").get();
      const root = settingsSnap.exists ? settingsSnap.data() || {} : {};
      const profile = root.masterConfig?.ownerControl?.businessProfile || {};
      const rawNumber = String(profile.supportWhatsAppNumber || root.support?.whatsappNumber || process.env.SUPPORT_WHATSAPP_NUMBER || "");
      const number = rawNumber.replace(/\D/g, "");
      if (!/^\d{8,15}$/.test(number)) {
        return res.status(503).json({ error: "WhatsApp support is not configured. Ask the OWNER to set the support number." });
      }
      const now = Date.now();
      const recent = await firestore.collection("supportTickets")
        .where("userId", "==", req.user.uid)
        .where("createdAtEpochMs", ">=", now - 60_000)
        .limit(3).get();
      if (recent.size >= 3) return res.status(429).json({ error: "Too many support requests. Please wait a minute." });
      const brandName = String(profile.brandName || "Family Suraksha").trim().slice(0, 100);
      const message = String(profile.supportWhatsAppMessage || ("Hello, I need support for " + brandName)).trim().slice(0, 500);
      const ticket = await firestore.collection("supportTickets").add({
        userId: req.user.uid,
        category: "WHATSAPP_SUPPORT",
        status: "OPEN",
        brandName,
        channel: "WHATSAPP",
        createdAtEpochMs: now,
        updatedAtEpochMs: now
      });
      const whatsappUrl = "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
      await firestore.collection("auditLogs").add({
        userId: req.user.uid,
        action: "SUPPORT_WHATSAPP_INITIATED",
        resource: "supportTicket",
        metadata: { ticketId: ticket.id, channel: "WHATSAPP" },
        createdAt: now
      });
      return res.status(201).json({ ok: true, ticketId: ticket.id, channel: "WHATSAPP", whatsappUrl });
    } catch (error) { next(error); }
  });

  // Create a short-lived, consent-based pairing invitation. The raw token/code
  // are returned only once; only their hashes are persisted.
  app.post("/api/pairing/invites", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const allowedRoles = new Set(["Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Husband", "Wife", "Mechanic", "Engineer", "Other"]);
      const senderRole = String(req.body?.senderRole || "");
      const receiverRole = String(req.body?.receiverRole || "");
      if (!allowedRoles.has(senderRole) || !allowedRoles.has(receiverRole)) {
        return res.status(400).json({ error: "Choose valid sender and receiver relationships." });
      }
      if (senderRole === receiverRole && senderRole !== "Other") {
        return res.status(400).json({ error: "Sender and receiver relationships must be different." });
      }
      // Invitation URLs must use the operator-configured trusted app origin.
      // Never fall back to a request Origin header for a security-sensitive link.
      const baseUrl = resolvePublicAppUrl(process.env.PUBLIC_APP_URL);
      if (!baseUrl) {
        return res.status(503).json({ error: "PUBLIC_APP_URL must be configured to a trusted HTTPS app origin before generating links." });
      }
      const now = Date.now();
      const recent = await firestore.collection("pairingInvites")
        .where("creatorUid", "==", req.user.uid)
        .where("createdAtEpochMs", ">=", now - 60_000)
        .limit(5).get();
      if (recent.size >= 5) return res.status(429).json({ error: "Too many invitations. Please wait a minute and try again." });

      const token = crypto.randomBytes(32).toString("base64url");
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const expiresAtEpochMs = now + 10 * 60_000;
      await firestore.collection("pairingInvites").doc(tokenHash).create({
        creatorUid: req.user.uid, senderRole, receiverRole, tokenHash, codeHash,
        status: "pending", createdAtEpochMs: now, expiresAtEpochMs
      });
      return res.status(201).json({
        link: baseUrl + "/link?token=" + encodeURIComponent(token),
        code, senderRole, receiverRole, expiresAtEpochMs
      });
    } catch (error) { next(error); }
  });

  // Validate an invitation without completing pairing. The receiving device
  // must still explicitly confirm before any device relationship is created.
  app.post("/api/pairing/invites/verify", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const token = String(req.body?.token || "");
      const code = String(req.body?.code || "");
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(token) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "A valid invitation link and 6-digit code are required." });
      }
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const ref = firestore.collection("pairingInvites").doc(tokenHash);
      const now = Date.now();
      const result = await firestore.runTransaction(async transaction => {
        const snap = await transaction.get(ref);
        if (!snap.exists) return { failure: { statusCode: 404, message: "Invitation not found or invalid." } };
        const invite = snap.data();
        if (Number(invite.lockedUntilEpochMs || 0) > now) {
          return { failure: { statusCode: 429, message: "Too many incorrect codes. This invitation is temporarily locked." } };
        }
        if (invite.status !== "pending" || invite.expiresAtEpochMs <= now) {
          return { failure: { statusCode: 410, message: "Invitation has expired or has already been used." } };
        }
        if (invite.codeHash !== codeHash) {
          const failedAttempts = Number(invite.failedAttempts || 0) + 1;
          const lockedUntilEpochMs = failedAttempts >= 5 ? now + 15 * 60_000 : 0;
          transaction.update(ref, { failedAttempts, lockedUntilEpochMs });
          return {
            failure: {
              statusCode: lockedUntilEpochMs > now ? 429 : 401,
              message: lockedUntilEpochMs > now
                ? "Too many incorrect codes. This invitation is locked for 15 minutes."
                : "Verification code is incorrect."
            }
          };
        }
        if (invite.creatorUid === req.user.uid) {
          return { failure: { statusCode: 400, message: "Open the invitation from the receiving account/device." } };
        }
        return {
          verified: true,
          senderRole: invite.senderRole,
          receiverRole: invite.receiverRole,
          requiresReceiverConsent: true,
          pairingCompleted: false
        };
      });
      if (result.failure) return res.status(result.failure.statusCode).json({ error: result.failure.message });
      return res.json(result);
    } catch (error) { next(error); }
  });

  app.get("/api/subscription/status", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const snap = await firestore.collection("subscriptions").where("userId", "==", req.user.uid)
        .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"]).orderBy("updatedAtEpochMs", "desc").limit(1).get();
      res.json({ subscription: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } });
    } catch (error) { next(error); }
  });

  require("./pairing-api").installPairingApi(app, { db: firestore, authenticate });
  installCatalogRoutes(app, { db: firestore, requireAuth: authenticate });
  installOwnerPanelRoutes(app, { db: firestore, auth });

  app.use((error, _req, res, _next) => {
    if (error?.message === "CORS origin is not allowed.") return res.status(403).json({ error: error.message });
    console.error("smart-control-backend", error);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

function createFirebaseApp() {
  const { initializeApp, getApps } = require("firebase-admin/app");
  return getApps().length ? getApps()[0] : initializeApp();
}

function createProductionApp() {
  createFirebaseApp();
  const auth = getAuth();
  const db = getFirestore();
  const postgresPool = createPostgresPool();
  const { createPostgresRepository } = require("./postgres-repository");
  return createApp({
    db,
    auth,
    postgres: postgresPool ? createPostgresRepository(postgresPool) : null,
    postgresPool,
    verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked)
  });
}

module.exports = { createApp, createProductionApp, resolvePublicAppUrl };