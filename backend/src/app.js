const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createPostgresPool, checkPostgres } = require("./postgres");
const { installPostgresRoutes } = require("./postgres-api");

function createApp({ verifyIdToken, db, postgres } = {}) {
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

  app.get("/healthz", (_req, res) => res.status(200).json({
    ok: true,
    service: "smart-control-backend",
    timestamp: new Date().toISOString()
  }));

  app.get("/readyz", async (_req, res) => {
    const checks = { firebase: Boolean(db), postgres: !process.env.DATABASE_URL };
    let pool = null;
    if (process.env.DATABASE_URL) {
      try {
        const { createPool, pingDatabase } = require("./db");
        pool = createPool();
        await pingDatabase(pool);
        checks.postgres = true;
      } catch (_) {
        checks.postgres = false;
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    }
    const ok = checks.firebase && checks.postgres;
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

  const firestore = db;

  const requireFirestore = (_req, res, next) => {
    if (!firestore) return res.status(503).json({ error: "Data service is unavailable." });
    next();
  };

  if (process.env.DATABASE_URL) {
    const pool = require("./db").createPool();
    installPostgresRoutes(app, { pool });
  }

  app.get("/api/auth/session", authenticate, (req, res) => {
    res.json({
      authenticated: true,
      uid: req.user.uid,
      email: req.user.email || null,
      phoneNumber: req.user.phone_number || null,
      admin: req.user.admin === true
    });
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

  app.get("/api/plans", authenticate, requireFirestore, async (_req, res, next) => {
    try {
      const snap = await firestore.collection("plans")
        .where("enabled", "==", true)
        .orderBy("displayOrder", "asc")
        .limit(100)
        .get();
      res.json({ plans: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/plans/:id", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const snap = await firestore.collection("plans").doc(req.params.id).get();
      if (!snap.exists || snap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      res.json({ plan: { id: snap.id, ...snap.data() } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/devices", authenticate, async (req, res, next) => {
    try {
      if (postgres) return res.json({ devices: await postgres.listDevices(req.user.uid) });
      if (!firestore) return res.status(503).json({ error: "Data service is unavailable." });
      const snap = await firestore.collection("devices").where("userId", "==", req.user.uid).limit(100).get();
      return res.json({ devices: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/subscription/status", authenticate, requireFirestore, async (req, res, next) => {
    try {
      const snap = await firestore.collection("subscriptions")
        .where("userId", "==", req.user.uid)
        .where("status", "in", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"])
        .orderBy("updatedAtEpochMs", "desc")
        .limit(1)
        .get();
      res.json({ subscription: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } });
    } catch (error) {
      next(error);
    }
  });

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
  const postgres = createPostgresPool();
  const { createPool } = require("./postgres");
  const { createPostgresRepository } = require("./postgres-repository");
  const postgresPool = process.env.DATABASE_URL ? createPool() : null;
  return createApp({
    db,
    postgres: postgresPool ? createPostgresRepository(postgresPool) : null,
    verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked)
  });
}

module.exports = { createApp, createProductionApp };
