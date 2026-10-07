function installOwnerPanelRoutes(app, { db }) {
  const collection = (name) => db.collection(name);
  const crypto = require("node:crypto");
  const { getLinkValidity, calculateExpiry } = require("./plan-policy");
  const now = () => Date.now();

  const requireOwner = (req, res, next) => {
    if (req.user?.owner !== true || String(req.user?.role || "").toUpperCase() !== "OWNER") {
      return res.status(403).json({ error: "OWNER access required." });
    }
    next();
  };

  const audit = async (req, action, resource, metadata = {}) => {
    await collection("auditLogs").add({
      userId: req.user.uid,
      action,
      resource,
      metadata,
      createdAt: now()
    });
  };

  const read = async (name, limit = 500) => {
    const snap = await collection(name).limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  };

  const normalizeFeatures = (body = {}) => {
    const all19 = body.all19 === true || body.allPermissions === true;
    const selected = Array.isArray(body.features) ? body.features.map(String).filter(Boolean) : [];
    return { all19, features: all19 ? Array.from({ length: 19 }, (_, i) => "PERMISSION_" + (i + 1)) : selected };
  };

  const normalizeFreeAccessDates = (body = {}) => {
    const start = body.startsAt == null ? now() : Number(body.startsAt);
    const end = body.endsAt == null ? null : Number(body.endsAt);
    if (!Number.isFinite(start)) throw Object.assign(new Error("startsAt must be a valid timestamp."), { statusCode: 400 });
    if (end !== null && (!Number.isFinite(end) || end <= start)) throw Object.assign(new Error("endsAt must be after startsAt."), { statusCode: 400 });
    return { startsAt: start, endsAt: end };
  };

  const expireFreeGrantIfNeeded = async (id, grant) => {
    const endsAt = grant?.endsAt == null ? null : Number(grant.endsAt);
    if (grant?.status === "ACTIVE" && Number.isFinite(endsAt) && endsAt <= now()) {
      const expiredAt = now();
      await collection("freeAccessGrants").doc(id).set({ status: "EXPIRED", expiredAt, updatedAt: expiredAt }, { merge: true });
      return { ...grant, status: "EXPIRED", expiredAt };
    }
    return grant;
  };

  const update = async (req, res, collectionName, id, resource, action) => {
    const values = req.body?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({ error: "values object is required." });
    }
    await collection(collectionName).doc(id).set({ ...values, updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
    await audit(req, action, resource, { id });
    return res.json({ ok: true, id, status: "UPDATED" });
  };

  app.get("/api/owner/panel", requireOwner, async (req, res, next) => {
    try {
      res.json({
        authenticated: true,
        owner: true,
        role: "OWNER",
        publicVisibility: "UNLISTED",
        identityVisibility: "PRIVATE",
        capabilities: {
          users: ["VIEW", "EDIT", "DELETE", "BAN"],
          features: ["ENABLE", "DISABLE", "CONFIGURE"],
          plans: ["CREATE", "EDIT", "DELETE", "PRICE", "DURATION", "FEATURES", "LINK_VALIDITY", "ENABLE", "DISABLE", "UPGRADE", "DOWNGRADE", "SPECIAL_OFFERS", "EMI"],
          settings: ["GLOBAL_CONFIGURE"],
          audit: ["VIEW_FULL_AUDIT_TRAIL"],
          freeAccess: ["GRANT", "CUSTOM_DURATION", "EDIT", "REVOKE"],
          payments: ["VIEW", "EDIT"],
          emi: ["VIEW", "EDIT"],
          legalTemplates: ["VIEW", "EDIT"],
          supportTickets: ["VIEW", "EDIT"],
          systemHealth: ["VIEW"],
           deviceLinks: ["GENERATE", "REGENERATE", "REVOKE"],
          featureFlags: ["ENABLE", "DISABLE", "CONFIGURE"]
        },
        ownerIdentity: null,
        note: "Owner identity is intentionally omitted from this panel response."
      });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/audit", requireOwner, async (req, res, next) => {
    try {
      res.json({ logs: await read("auditLogs", 1000) });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/users", requireOwner, async (req, res, next) => {
    try { res.json({ users: await read("users") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/users/:id", requireOwner, (req, res, next) => update(req, res, "users", req.params.id, "user", "OWNER_USER_EDITED").catch(next));
  app.post("/api/owner/users/:id/ban", requireOwner, async (req, res, next) => {
    try {
      await collection("users").doc(req.params.id).set({ status: "BANNED", bannedAt: now(), bannedBy: req.user.uid }, { merge: true });
      await audit(req, "OWNER_USER_BANNED", "user", { id: req.params.id });
      res.json({ ok: true, id: req.params.id, status: "BANNED" });
    } catch (e) { next(e); }
  });
  app.delete("/api/owner/users/:id", requireOwner, async (req, res, next) => {
    try {
      await collection("users").doc(req.params.id).delete();
      await audit(req, "OWNER_USER_DELETED", "user", { id: req.params.id });
      res.json({ ok: true, id: req.params.id, status: "DELETED" });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/plans", requireOwner, async (req, res, next) => {
    try { res.json({ plans: await read("plans") }); } catch (e) { next(e); }
  });
  app.post("/api/owner/plans", requireOwner, async (req, res, next) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ error: "values object is required." });
      const ref = await collection("plans").add({ ...values, createdAt: now(), updatedAt: now(), createdBy: req.user.uid });
      await audit(req, "OWNER_PLAN_CREATED", "plan", { id: ref.id });
      res.status(201).json({ ok: true, id: ref.id, status: "CREATED" });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/plans/:id", requireOwner, (req, res, next) => update(req, res, "plans", req.params.id, "plan", "OWNER_PLAN_EDITED").catch(next));
  app.delete("/api/owner/plans/:id", requireOwner, async (req, res, next) => {
    try {
      await collection("plans").doc(req.params.id).delete();
      await audit(req, "OWNER_PLAN_DELETED", "plan", { id: req.params.id });
      res.json({ ok: true, id: req.params.id, status: "DELETED" });
    } catch (e) { next(e); }
  });

  app.post("/api/owner/device-links/generate", requireOwner, async (req, res, next) => {
    try {
      const planId = String(req.body?.planId || "").trim();
      if (!planId) return res.status(400).json({ error: "planId is required." });
      const planSnap = await collection("plans").doc(planId).get();
      if (!planSnap.exists || planSnap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      const plan = { id: planSnap.id, ...planSnap.data() };
      const validity = getLinkValidity(plan);
      if (!validity) return res.status(400).json({ error: "Plan device-link validity is not configured." });
      const code = crypto.randomBytes(8).toString("base64url").slice(0, 11).toUpperCase();
      const createdAt = now();
      const expiresAt = calculateExpiry(createdAt, validity);
      await collection("pairingCodes").doc(code).set({ ownerUid: req.user.uid, status: "PENDING", createdAt, expiresAt, planId, linkValidityValue: validity.value, linkValidityUnit: validity.unit });
      await audit(req, "OWNER_DEVICE_LINK_GENERATED", "pairingCode", { planId, code, expiresAt });
      res.status(201).json({ ok: true, code, planId, expiresAt });
    } catch (e) { next(e); }
  });

  app.post("/api/owner/device-links/regenerate/:code", requireOwner, async (req, res, next) => {
    try {
      const oldCode = String(req.params.code || "").trim().toUpperCase();
      const oldRef = collection("pairingCodes").doc(oldCode);
      const oldSnap = await oldRef.get();
      if (!oldSnap.exists || oldSnap.data()?.ownerUid !== req.user.uid) return res.status(404).json({ error: "Device link not found." });
      await oldRef.set({ status: "REVOKED", revokedAt: now(), updatedAt: now() }, { merge: true });
      const planId = String(oldSnap.data()?.planId || req.body?.planId || "").trim();
      if (!planId) return res.status(400).json({ error: "planId is required." });
      const planSnap = await collection("plans").doc(planId).get();
      if (!planSnap.exists || planSnap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      const validity = getLinkValidity({ id: planSnap.id, ...planSnap.data() });
      if (!validity) return res.status(400).json({ error: "Plan device-link validity is not configured." });
      const code = crypto.randomBytes(8).toString("base64url").slice(0, 11).toUpperCase();
      const createdAt = now();
      const expiresAt = calculateExpiry(createdAt, validity);
      await collection("pairingCodes").doc(code).set({ ownerUid: req.user.uid, status: "PENDING", createdAt, expiresAt, planId, linkValidityValue: validity.value, linkValidityUnit: validity.unit });
      await audit(req, "OWNER_DEVICE_LINK_REGENERATED", "pairingCode", { oldCode, planId, newCode: code, expiresAt });
      res.status(201).json({ ok: true, code, planId, expiresAt, previousCode: oldCode });
    } catch (e) { next(e); }
  });

  app.post("/api/owner/device-links/revoke/:code", requireOwner, async (req, res, next) => {
    try {
      const code = String(req.params.code || "").trim().toUpperCase();
      const ref = collection("pairingCodes").doc(code);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.ownerUid !== req.user.uid) return res.status(404).json({ error: "Device link not found." });
      await ref.set({ status: "REVOKED", revokedAt: now(), updatedAt: now() }, { merge: true });
      await audit(req, "OWNER_DEVICE_LINK_REVOKED", "pairingCode", { code });
      res.json({ ok: true, code, status: "REVOKED" });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/feature-flags", requireOwner, async (req, res, next) => {
    try { res.json({ featureFlags: await read("featureFlags") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/feature-flags/:id", requireOwner, (req, res, next) => update(req, res, "featureFlags", req.params.id, "featureFlag", "OWNER_FEATURE_FLAG_EDITED").catch(next));

  app.patch("/api/owner/settings", requireOwner, async (req, res, next) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ error: "values object is required." });
      await collection("systemConfig").doc("current").set({ values, updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
      await audit(req, "OWNER_GLOBAL_SETTINGS_EDITED", "systemConfig");
      res.json({ ok: true, status: "UPDATED" });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/subscriptions", requireOwner, async (req, res, next) => {
    try { res.json({ subscriptions: await read("subscriptions") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/subscriptions/:id", requireOwner, (req, res, next) => update(req, res, "subscriptions", req.params.id, "subscription", "OWNER_SUBSCRIPTION_EDITED").catch(next));
  app.delete("/api/owner/subscriptions/:id", requireOwner, async (req, res, next) => {
    try {
      await collection("subscriptions").doc(req.params.id).delete();
      await audit(req, "OWNER_SUBSCRIPTION_DELETED", "subscription", { id: req.params.id });
      res.json({ ok: true, id: req.params.id, status: "DELETED" });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/free-access", requireOwner, async (req, res, next) => {
    try {
      const grants = await read("freeAccessGrants");
      const normalized = [];
      for (const grant of grants) normalized.push({ id: grant.id, ...(await expireFreeGrantIfNeeded(grant.id, grant)) });
      res.json({ grants: normalized });
    } catch (e) { next(e); }
  });

  app.post("/api/owner/free-access", requireOwner, async (req, res, next) => {
    try {
      const userName = String(req.body?.userName || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const mobile = String(req.body?.mobile || "").trim();
      const userId = String(req.body?.userId || "").trim() || null;
      if (!userName || (!email && !mobile)) return res.status(400).json({ error: "userName and email or mobile are required." });
      const dates = normalizeFreeAccessDates(req.body);
      if (dates.startsAt > now()) return res.status(400).json({ error: "startsAt cannot be in the future for instant approval." });
      if (dates.endsAt !== null && dates.endsAt <= now()) return res.status(400).json({ error: "endsAt must be in the future." });
      const features = normalizeFeatures(req.body);
      const ref = await collection("freeAccessGrants").add({
        userId, userName, email: email || null, mobile: mobile || null,
        grantedBy: req.user.uid, status: "ACTIVE", startsAt: dates.startsAt, endsAt: dates.endsAt,
        all19: features.all19, features: features.features,
        durationPreset: String(req.body?.durationPreset || "CUSTOM").toUpperCase(),
        reason: String(req.body?.reason || "").slice(0, 500),
        approvedAt: now(), createdAt: now(), updatedAt: now()
      });
      await audit(req, "OWNER_FREE_ACCESS_APPROVED", "freeAccessGrant", { id: ref.id, userId, email: email || null, mobile: mobile || null, all19: features.all19, featureCount: features.features.length, startsAt: dates.startsAt, endsAt: dates.endsAt });
      res.status(201).json({ ok: true, id: ref.id, status: "ACTIVE", startsAt: dates.startsAt, endsAt: dates.endsAt, all19: features.all19, featureCount: features.features.length });
    } catch (e) { if (e.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  });
  app.patch("/api/owner/free-access/:id", requireOwner, async (req, res, next) => {
    try {
      const current = await collection("freeAccessGrants").doc(req.params.id).get();
      if (!current.exists) return res.status(404).json({ error: "Free access grant not found." });
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ error: "values object is required." });
      const nextValues = { ...values };
      if (Object.prototype.hasOwnProperty.call(values, "startsAt") || Object.prototype.hasOwnProperty.call(values, "endsAt")) {
        const dates = normalizeFreeAccessDates(values);
        if (dates.endsAt !== null && dates.endsAt <= now()) return res.status(400).json({ error: "endsAt must be in the future." });
        nextValues.startsAt = dates.startsAt;
        nextValues.endsAt = dates.endsAt;
      }
      if (Object.prototype.hasOwnProperty.call(values, "all19") || Object.prototype.hasOwnProperty.call(values, "allPermissions") || Object.prototype.hasOwnProperty.call(values, "features")) {
        Object.assign(nextValues, normalizeFeatures(values));
      }
      await collection("freeAccessGrants").doc(req.params.id).set({ ...nextValues, status: "ACTIVE", updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
      await audit(req, "OWNER_FREE_ACCESS_EDITED", "freeAccessGrant", { id: req.params.id, changedFields: Object.keys(nextValues) });
      res.json({ ok: true, id: req.params.id, status: "ACTIVE", startsAt: nextValues.startsAt, endsAt: nextValues.endsAt, all19: nextValues.all19, features: nextValues.features });
    } catch (e) { next(e); }
  });
  app.post("/api/owner/free-access/:id/revoke", requireOwner, async (req, res, next) => {
    try {
      await collection("freeAccessGrants").doc(req.params.id).set({ status: "REVOKED", revokedAt: now(), updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
      await audit(req, "OWNER_FREE_ACCESS_REVOKED", "freeAccessGrant", { id: req.params.id });
      res.json({ ok: true, id: req.params.id, status: "REVOKED" });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/payments", requireOwner, async (req, res, next) => {
    try { res.json({ payments: await read("payments") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/payments/:id", requireOwner, (req, res, next) => update(req, res, "payments", req.params.id, "payment", "OWNER_PAYMENT_EDITED").catch(next));

  app.get("/api/owner/emi", requireOwner, async (req, res, next) => {
    try { res.json({ emi: await read("emiApplications") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/emi/:id", requireOwner, (req, res, next) => update(req, res, "emiApplications", req.params.id, "emi", "OWNER_EMI_EDITED").catch(next));

  app.get("/api/owner/legal-templates", requireOwner, async (req, res, next) => {
    try { res.json({ templates: await read("legalTemplates") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/legal-templates/:id", requireOwner, (req, res, next) => update(req, res, "legalTemplates", req.params.id, "legalTemplate", "OWNER_LEGAL_TEMPLATE_EDITED").catch(next));

  app.get("/api/owner/support-tickets", requireOwner, async (req, res, next) => {
    try { res.json({ tickets: await read("supportTickets") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/support-tickets/:id", requireOwner, (req, res, next) => update(req, res, "supportTickets", req.params.id, "supportTicket", "OWNER_SUPPORT_TICKET_EDITED").catch(next));

  app.get("/api/owner/health", requireOwner, async (req, res) => {
    res.json({ ok: true, service: "smart-control-backend", checkedAt: now() });
  });
}

module.exports = { installOwnerPanelRoutes };
