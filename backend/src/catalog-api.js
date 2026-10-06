const crypto = require("node:crypto");

function installCatalogRoutes(app, { db }) {
  const requireUser = (req, res, next) => {
    if (!req.user?.uid) return res.status(401).json({ error: "Authentication required." });
    req.catalogUid = req.user.uid;
    next();
  };

  const requireAdmin = (req, res, next) => {
    if (req.user?.admin !== true) return res.status(403).json({ error: "Administrator access required." });
    next();
  };

  const firestoreCollection = (name) => db?.collection(name);

  async function audit(uid, action, resource, metadata = {}) {
    if (!db) return;
    await firestoreCollection("auditLogs").add({
      userId: uid,
      action,
      resource,
      metadata,
      createdAt: Date.now()
    });
  }

  app.use("/api/catalog", requireUser);

  app.get("/api/link/status", async (req, res, next) => {
    try {
      if (!db) return res.json({ links: [], active: false });
      const snap = await firestoreCollection("devices").where("controllerUid", "==", req.catalogUid).limit(100).get();
      res.json({ active: !snap.empty, devices: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) { next(e); }
  });

  app.get("/api/link/history", async (req, res, next) => {
    try {
      if (!db) return res.json({ links: [] });
      const snap = await firestoreCollection("connectionLogs").where("userId", "==", req.catalogUid).limit(100).get();
      res.json({ links: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) { next(e); }
  });

  app.post("/api/link/generate", async (req, res, next) => {
    try {
      const code = crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
      if (db) await firestoreCollection("pairingCodes").doc(code).set({ ownerUid: req.catalogUid, status: "PENDING", createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });
      await audit(req.catalogUid, "LINK_CODE_GENERATED", "pairingCode", { code });
      res.status(201).json({ code, expiresAt: Date.now() + 10 * 60 * 1000 });
    } catch (e) { next(e); }
  });

  app.post("/api/link/join", async (req, res, next) => {
    try {
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code) return res.status(400).json({ error: "Pairing code is required." });
      if (!db) return res.status(503).json({ error: "Pairing storage is unavailable." });
      const ref = firestoreCollection("pairingCodes").doc(code);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : null;
      if (!data || data.status !== "PENDING" || Number(data.expiresAt) < Date.now()) return res.status(404).json({ error: "Pairing code is invalid or expired." });
      await ref.set({ clientUid: req.catalogUid, status: "PAIRED", pairedAt: Date.now() }, { merge: true });
      await audit(req.catalogUid, "LINK_JOINED", "pairingCode", { code });
      res.json({ ok: true, ownerUid: data.ownerUid });
    } catch (e) { next(e); }
  });

  app.post("/api/link/share", async (req, res, next) => {
    try {
      const link = String(req.body?.link || "").trim();
      if (!link || link.length > 2048) return res.status(400).json({ error: "Valid link is required." });
      await audit(req.catalogUid, "LINK_SHARED", "link", { link });
      res.status(201).json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post("/api/connect", async (req, res, next) => {
    try {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "deviceId is required." });
      await audit(req.catalogUid, "CONNECT_REQUESTED", "device", { deviceId });
      res.status(202).json({ ok: true, status: "REQUESTED", deviceId });
    } catch (e) { next(e); }
  });

  app.post("/api/disconnect", async (req, res, next) => {
    try {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "deviceId is required." });
      await audit(req.catalogUid, "DISCONNECT_REQUESTED", "device", { deviceId });
      res.json({ ok: true, status: "DISCONNECT_REQUESTED", deviceId });
    } catch (e) { next(e); }
  });

  app.post("/api/reconnect", async (req, res, next) => {
    try {
      const deviceId = String(req.body?.deviceId || "").trim();
      if (!deviceId) return res.status(400).json({ error: "deviceId is required." });
      await audit(req.catalogUid, "RECONNECT_REQUESTED", "device", { deviceId });
      res.status(202).json({ ok: true, status: "REQUESTED", deviceId });
    } catch (e) { next(e); }
  });

  app.get("/api/devices/:id", async (req, res, next) => {
    try {
      if (!db) return res.status(404).json({ error: "Device not found." });
      const snap = await firestoreCollection("devices").doc(req.params.id).get();
      if (!snap.exists || snap.data()?.userId !== req.catalogUid && snap.data()?.controllerUid !== req.catalogUid) return res.status(404).json({ error: "Device not found." });
      res.json({ device: { id: snap.id, ...snap.data() } });
    } catch (e) { next(e); }
  });

  app.get("/api/permissions", requireUser, async (_req, res) => res.json({ permissions: [] }));
  app.get("/api/permissions/:id", requireUser, async (req, res) => res.json({ permission: { id: req.params.id, status: "UNKNOWN" } }));
  app.get("/api/permissions/status", requireUser, async (_req, res) => res.json({ status: "CONSENT_REQUIRED", permissions: [] }));
  app.get("/api/permissions/logs", requireUser, async (_req, res) => res.json({ logs: [] }));

  app.post("/api/permissions/request", async (req, res, next) => {
    try { await audit(req.catalogUid, "PERMISSION_REQUESTED", "permission", { permission: String(req.body?.permission || "") }); res.status(202).json({ ok: true, status: "REQUESTED" }); } catch (e) { next(e); }
  });
  app.post("/api/permissions/grant", async (req, res, next) => {
    try { await audit(req.catalogUid, "PERMISSION_GRANTED", "permission", { permission: String(req.body?.permission || "") }); res.json({ ok: true, status: "GRANTED" }); } catch (e) { next(e); }
  });
  app.post("/api/permissions/revoke", async (req, res, next) => {
    try { await audit(req.catalogUid, "PERMISSION_REVOKED", "permission", { permission: String(req.body?.permission || "") }); res.json({ ok: true, status: "REVOKED" }); } catch (e) { next(e); }
  });
  app.post("/api/permissions/allow-all", async (req, res, next) => {
    try { await audit(req.catalogUid, "PERMISSION_ALLOW_ALL_REQUESTED", "permissions"); res.status(202).json({ ok: true, status: "USER_CONFIRMATION_REQUIRED" }); } catch (e) { next(e); }
  });

  app.post("/api/consent/save", async (req, res, next) => {
    try {
      const scope = Array.isArray(req.body?.scope) ? req.body.scope.map(String).slice(0, 100) : [];
      if (!scope.length) return res.status(400).json({ error: "Consent scope is required." });
      const consentId = crypto.randomUUID();
      if (db) await firestoreCollection("consentLogs").doc(consentId).set({ userId: req.catalogUid, scope, granted: true, createdAt: Date.now(), consentId });
      res.status(201).json({ ok: true, consentId });
    } catch (e) { next(e); }
  });

  app.post("/api/consent/verify", async (req, res, next) => {
    try {
      const consentId = String(req.body?.consentId || "");
      if (!consentId || !db) return res.json({ valid: false });
      const snap = await firestoreCollection("consentLogs").doc(consentId).get();
      const data = snap.exists ? snap.data() : {};
      res.json({ valid: snap.exists && data.userId === req.catalogUid && data.granted === true });
    } catch (e) { next(e); }
  });

  app.get("/api/consent/history", async (req, res, next) => {
    try { if (!db) return res.json({ consents: [] }); const snap = await firestoreCollection("consentLogs").where("userId", "==", req.catalogUid).limit(100).get(); res.json({ consents: snap.docs.map(d => ({ id: d.id, ...d.data() })) }); } catch (e) { next(e); }
  });

  app.get("/api/consent/export", async (req, res, next) => {
    try { if (!db) return res.json({ consents: [] }); const snap = await firestoreCollection("consentLogs").where("userId", "==", req.catalogUid).limit(500).get(); res.json({ consents: snap.docs.map(d => d.data()) }); } catch (e) { next(e); }
  });

  const sessionRoute = (path, method, action) => {
    app[method](path, async (req, res, next) => {
      try {
        const sessionId = String(req.body?.sessionId || req.query?.sessionId || "").trim();
        if (!sessionId) return res.status(400).json({ error: "sessionId is required." });
        if (!db) return res.status(503).json({ error: "Session storage is unavailable." });
        const snap = await firestoreCollection("mediaSessions").doc(sessionId).get();
        if (!snap.exists) return res.status(404).json({ error: "Session not found." });
        const data = snap.data() || {};
        if (data.controllerUid !== req.catalogUid && data.targetDeviceId !== req.catalogUid) return res.status(403).json({ error: "Not authorized for this session." });
        await audit(req.catalogUid, action, "mediaSession", { sessionId });
        res.json({ ok: true, sessionId, status: data.status || "UNKNOWN" });
      } catch (e) { next(e); }
    });
  };

  sessionRoute("/api/control/status", "get", "CONTROL_STATUS_READ");
  sessionRoute("/api/control/live", "get", "CONTROL_LIVE_READ");
  sessionRoute("/api/control/history", "get", "CONTROL_HISTORY_READ");
  sessionRoute("/api/control/logs", "get", "CONTROL_LOGS_READ");
  for (const [path, action] of [
    ["/api/control/touch","CONTROL_TOUCH_REQUESTED"],["/api/control/keyboard","CONTROL_KEYBOARD_REQUESTED"],
    ["/api/control/app/install","CONTROL_APP_INSTALL_REQUESTED"],["/api/control/app/uninstall","CONTROL_APP_UNINSTALL_REQUESTED"],
    ["/api/control/file/transfer","CONTROL_FILE_TRANSFER_REQUESTED"],["/api/control/clipboard","CONTROL_CLIPBOARD_REQUESTED"],
    ["/api/control/screen/share","CONTROL_SCREEN_SHARE_REQUESTED"],["/api/control/screen/record","CONTROL_SCREEN_RECORD_REQUESTED"],
    ["/api/control/camera","CONTROL_CAMERA_REQUESTED"],["/api/control/mic","CONTROL_MIC_REQUESTED"],
    ["/api/control/p2p/start","CONTROL_P2P_START_REQUESTED"],["/api/control/p2p/stop","CONTROL_P2P_STOP_REQUESTED"]
  ]) {
    app.post(path, async (req, res, next) => {
      try {
        const sessionId = String(req.body?.sessionId || "").trim();
        if (!sessionId || !db) return res.status(400).json({ error: "Approved sessionId is required." });
        const snap = await firestoreCollection("mediaSessions").doc(sessionId).get();
        const data = snap.exists ? snap.data() || {} : {};
        if (!snap.exists || data.controllerUid !== req.catalogUid || data.status !== "ACTIVE" || data.consentGranted !== true) return res.status(403).json({ error: "Active user-approved session and consent are required." });
        await audit(req.catalogUid, action, "mediaSession", { sessionId });
        res.status(202).json({ ok: true, accepted: true, sessionId });
      } catch (e) { next(e); }
    });
  }

  for (const [path, collection, action] of [
    ["/api/data/location","locationData","DATA_LOCATION_READ"],["/api/data/contacts","contacts","DATA_CONTACTS_READ"],
    ["/api/data/sms","smsLogs","DATA_SMS_READ"],["/api/data/call-logs","callLogs","DATA_CALL_LOGS_READ"],
    ["/api/data/files","filesAccess","DATA_FILES_READ"],["/api/data/gallery","galleryData","DATA_GALLERY_READ"],
    ["/api/data/app-usage","appUsage","DATA_APP_USAGE_READ"],["/api/data/battery","batteryInfo","DATA_BATTERY_READ"]
  ]) {
    app.get(path, async (req, res, next) => {
      try {
        if (!db) return res.json({ data: [] });
        const snap = await firestoreCollection(collection).where("userId", "==", req.catalogUid).limit(100).get();
        await audit(req.catalogUid, action, collection);
        res.json({ data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
      } catch (e) { next(e); }
    });
  }

  app.post("/api/data/download", async (req, res, next) => { try { await audit(req.catalogUid, "DATA_DOWNLOAD_REQUESTED", "data", { scope: req.body?.scope || null }); res.status(202).json({ ok: true, status: "REQUESTED" }); } catch (e) { next(e); } });
  app.post("/api/data/share", async (req, res, next) => { try { await audit(req.catalogUid, "DATA_SHARE_REQUESTED", "data", { scope: req.body?.scope || null }); res.status(202).json({ ok: true, status: "REQUESTED" }); } catch (e) { next(e); } });

  app.post("/api/subscribe", async (req, res, next) => { try { await audit(req.catalogUid, "SUBSCRIBE_REQUESTED", "plan", { planId: req.body?.planId || null }); res.status(202).json({ ok: true, status: "PENDING_PAYMENT" }); } catch (e) { next(e); } });
  app.post("/api/payment/initiate", async (req, res, next) => { try { const paymentId = crypto.randomUUID(); await audit(req.catalogUid, "PAYMENT_INITIATED", "payment", { paymentId, planId: req.body?.planId || null }); res.status(201).json({ paymentId, status: "INITIATED" }); } catch (e) { next(e); } });
  app.post("/api/payment/verify", async (req, res, next) => { try { await audit(req.catalogUid, "PAYMENT_VERIFICATION_REQUESTED", "payment", { paymentId: req.body?.paymentId || null }); res.status(202).json({ ok: true, status: "VERIFICATION_PENDING" }); } catch (e) { next(e); } });
  app.post("/api/emi/apply", async (req, res, next) => { try { await audit(req.catalogUid, "EMI_APPLICATION_REQUESTED", "emi", { planId: req.body?.planId || null }); res.status(202).json({ ok: true, status: "PENDING_REVIEW" }); } catch (e) { next(e); } });
  app.get("/api/payment/history", async (req, res) => res.json({ payments: [] }));

  app.post("/api/sos/trigger", async (req, res, next) => { try { await audit(req.catalogUid, "SOS_TRIGGERED", "sos"); res.status(202).json({ ok: true, status: "TRIGGERED" }); } catch (e) { next(e); } });
  app.post("/api/sos/cancel", async (req, res, next) => { try { await audit(req.catalogUid, "SOS_CANCEL_REQUESTED", "sos"); res.json({ ok: true, status: "CANCELLED" }); } catch (e) { next(e); } });
  app.get("/api/sos/history", async (req, res) => res.json({ alerts: [] }));
  app.post("/api/system/sync", async (req, res, next) => { try { await audit(req.catalogUid, "SYSTEM_SYNC_REQUESTED", "system"); res.status(202).json({ ok: true, status: "REQUESTED" }); } catch (e) { next(e); } });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => res.json({ users: [] }));
  app.get("/api/admin/devices", requireAdmin, async (_req, res) => res.json({ devices: [] }));
  app.get("/api/admin/plans", requireAdmin, async (_req, res) => res.json({ plans: [] }));
  app.get("/api/admin/subscriptions", requireAdmin, async (_req, res) => res.json({ subscriptions: [] }));
  app.get("/api/admin/analytics", requireAdmin, async (_req, res) => res.json({ analytics: {} }));
  app.get("/api/admin/logs", requireAdmin, async (_req, res) => res.json({ logs: [] }));
  app.get("/api/admin/support/tickets", requireAdmin, async (_req, res) => res.json({ tickets: [] }));
  app.post("/api/admin/free-access/grant", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/free-access/edit", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/free-access/revoke", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/user/ban", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/user/unban", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/system/config", requireAdmin, async (req,res)=>res.status(202).json({ok:true,status:"REQUESTED"}));
  app.post("/api/admin/login", requireUser, async (req,res)=>res.json({ok:req.user.admin===true}));
  app.post("/api/support/whatsapp/initiate", async (req,res,next)=>{try{await audit(req.catalogUid,"WHATSAPP_SUPPORT_INITIATED","support");res.status(202).json({ok:true,status:"REQUESTED"});}catch(e){next(e);}});
  app.get("/api/support/whatsapp/status", async (_req,res)=>res.json({status:"NOT_CONNECTED"}));
  app.post("/api/support/ticket/create", async (req,res,next)=>{try{const ticketId=crypto.randomUUID();await audit(req.catalogUid,"SUPPORT_TICKET_CREATED","support",{ticketId});res.status(201).json({ticketId,status:"OPEN"});}catch(e){next(e);}});
}

module.exports = { installCatalogRoutes };
