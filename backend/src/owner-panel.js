function installOwnerPanelRoutes(app, { db }) {
  const collection = (name) => db.collection(name);
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
          plans: ["CREATE", "EDIT", "DELETE"],
          settings: ["GLOBAL_CONFIGURE"],
          audit: ["VIEW_FULL_AUDIT_TRAIL"],
          freeAccess: ["GRANT", "CUSTOM_DURATION", "EDIT", "REVOKE"],
          payments: ["VIEW", "EDIT"],
          emi: ["VIEW", "EDIT"],
          legalTemplates: ["VIEW", "EDIT"],
          supportTickets: ["VIEW", "EDIT"],
          systemHealth: ["VIEW"],
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
