const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createPool: createPostgresPool, checkPostgres } = require("./postgres");
const { installPostgresRoutes } = require("./postgres-api");
const { getResidencyPolicy } = require("./data-residency");
const { installCatalogRoutes } = require("./catalog-api");

function createApp({ verifyIdToken, db, postgres, postgresPool } = {}) {
  const app = express();
  const allowedOrigins = String(process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
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
    try {
      req.user = await verifyIdToken(header.slice(7), true);
      return next();
    } catch (_) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }
  };

  app.get("/api/system/residency", authenticate, (_req, res) => res.json(getResidencyPolicy()));

  const firestore = db;
  const requireFirestore = (_req, res, next) => {
    if (!firestore) return res.status(503).json({ error: "Data service is unavailable." });
    next();
  };

  if (postgresPool) installPostgresRoutes(app, { pool: postgresPool });

  app.get("/api/config", authenticate, async (_req, res, next) => {
    try {
      const { getRemoteConfig } = require("firebase-admin/remote-config");
      const template = await getRemoteConfig().getTemplate();
      const values = {};
      for (const [key, parameter] of Object.entries(template.parameters || {})) {
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
      admin: req.user.admin === true
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
    res.json({
      ok: firestoreStatus !== "error",
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
      const result = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data: { source: "smart-control-backend" } });
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
      if (postgres) return res.json({ devices: await postgres.listDevices(req.user.uid) });
      if (!firestore) return res.status(503).json({ error: "Data service is unavailable." });
      const snap = await firestore.collection("devices").where("userId", "==", req.user.uid).limit(100).get();
      return res.json({ devices: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    } catch (error) { next(error); }
  });

  app.get("/api/subscription/status", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const snap = await firestore.collection("subscriptions").where("userId", "==", req.user.uid)
        .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"]).orderBy("updatedAtEpochMs", "desc").limit(1).get();
      res.json({ subscription: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } });
    } catch (error) { next(error); }
  });

  installCatalogRoutes(app, { db: firestore, requireAuth: authenticate });

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
    postgres: postgresPool ? createPostgresRepository(postgresPool) : null,
    postgresPool,
    verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked)
  });
}

module.exports = { createApp, createProductionApp };
