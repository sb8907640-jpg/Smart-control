function installOwnerPanelRoutes(app, { db }) {
  const collection = (name) => db.collection(name);
  const crypto = require("node:crypto");
  const { getLinkValidity, calculateExpiry } = require("./plan-policy");
  // Keep the backend's allowlisted feature keys local: the production Docker
  // build intentionally copies backend/src only, not the Firebase Functions tree.
  const FEATURES = [
    { id: 1, key: "LOCATION", name: "Location", description: "Live location share" },
    { id: 2, key: "NOTIFICATIONS", name: "Notifications", description: "Read notifications" },
    { id: 3, key: "BATTERY_NETWORK", name: "Battery & Network", description: "Battery/network info" },
    { id: 4, key: "CAMERA", name: "Camera", description: "Camera access" },
    { id: 5, key: "MICROPHONE", name: "Microphone", description: "Mic access" },
    { id: 6, key: "GALLERY", name: "Gallery", description: "Access photos/videos" },
    { id: 7, key: "SCREEN_SHARE", name: "Screen Share", description: "Share your screen" },
    { id: 8, key: "SCREEN_RECORDING", name: "Screen Recording", description: "Record your screen" },
    { id: 9, key: "TOUCH_CONTROL", name: "Touch Control", description: "Touch control" },
    { id: 10, key: "KEYBOARD_INPUT", name: "Keyboard Input", description: "Keyboard input" },
    { id: 11, key: "APP_INSTALL_UNINSTALL", name: "App Install / Uninstall", description: "Install/uninstall apps" },
    { id: 12, key: "FILE_TRANSFER", name: "File Transfer", description: "Send and receive files" },
    { id: 13, key: "CLIPBOARD_SYNC", name: "Clipboard Sync", description: "Sync clipboard text" },
    { id: 14, key: "FILES_ACCESS", name: "Files Access", description: "Access files/folders" },
    { id: 15, key: "CONTACTS", name: "Contacts", description: "View contacts" },
    { id: 16, key: "SMS", name: "SMS", description: "View SMS (read-only)" },
    { id: 17, key: "CALL_LOGS", name: "Call Logs", description: "View call history" },
    { id: 18, key: "APP_USAGE", name: "App Usage", description: "App usage" },
    { id: 19, key: "SOS_ALERTS", name: "SOS Alerts", description: "Emergency SOS alerts" }
  ];
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

  app.get("/api/owner/panel", requireOwner, async (req, res) => {
    res.json({
      authenticated: true, owner: true, role: "OWNER",
      publicVisibility: "UNLISTED", identityVisibility: "PRIVATE",
      capabilities: {
        users: ["VIEW", "EDIT", "DELETE", "BAN"],
        features: ["ENABLE", "DISABLE", "CONFIGURE"],
        plans: ["CREATE", "EDIT", "DELETE", "PRICE", "DURATION", "FEATURES", "LINK_VALIDITY", "ENABLE", "DISABLE", "UPGRADE", "DOWNGRADE", "SPECIAL_OFFERS", "EMI"],
        settings: ["GLOBAL_CONFIGURE"], audit: ["VIEW_FULL_AUDIT_TRAIL"],
        freeAccess: ["GRANT", "CUSTOM_DURATION", "EDIT", "REVOKE"],
        payments: ["VIEW", "EDIT"], emi: ["VIEW", "EDIT"],
        legalTemplates: ["VIEW", "EDIT"], supportTickets: ["VIEW", "EDIT"],
        systemHealth: ["VIEW"], deviceLinks: ["GENERATE", "REGENERATE", "REVOKE"],
        featureFlags: ["ENABLE", "DISABLE", "CONFIGURE"]
      },
      ownerIdentity: null,
      note: "Owner identity is intentionally omitted from this panel response."
    });
  });

  app.get("/api/owner/audit", requireOwner, async (req, res, next) => {
    try { res.json({ logs: await read("auditLogs", 1000) }); } catch (e) { next(e); }
  });
  const userProfileFields = new Set([
    "name", "displayName", "email", "phoneNumber", "mobile", "photoURL", "photoUrl"
  ]);
  const updateUserProfile = async (req, res) => {
    const id = String(req.params.id || "").trim();
    const values = req.body?.values;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return res.status(400).json({ error: "Invalid user ID." });
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({ error: "values object is required." });
    }
    const keys = Object.keys(values);
    if (!keys.length || keys.some(key => !userProfileFields.has(key))) {
      return res.status(400).json({ error: "Only profile fields may be edited. Account status, roles, permissions, and identity claims require dedicated server-side controls." });
    }
    const normalized = {};
    for (const key of keys) {
      const value = values[key];
      if (value !== null && typeof value !== "string") {
        return res.status(400).json({ error: "Profile values must be strings or null." });
      }
      const max = key === "email" ? 254 : key === "photoURL" || key === "photoUrl" ? 2048 : 160;
      if (typeof value === "string" && (value.length > max || value.includes("\u0000"))) {
        return res.status(400).json({ error: "A profile field exceeds its allowed length or contains invalid characters." });
      }
      if (key === "email" && typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return res.status(400).json({ error: "A valid profile email is required." });
      }
      normalized[key] = typeof value === "string" ? value.trim() : value;
    }
    const ref = collection("users").doc(id);
    const before = await ref.get();
    if (!before.exists) return res.status(404).json({ error: "User not found." });
    await ref.set({ ...normalized, updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
    await audit(req, "OWNER_USER_PROFILE_EDITED", "user", { id, fields: keys });
    return res.json({ ok: true, id, status: "UPDATED", fields: keys });
  };

  const setUserStatus = async (req, res, status, action) => {
    const id = String(req.params.id || "").trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return res.status(400).json({ error: "Invalid user ID." });
    if (id === req.user.uid) return res.status(409).json({ error: "Owners cannot change their own account status through this endpoint." });
    const ref = collection("users").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "User not found." });
    const previousStatus = String(snap.data()?.status || "ACTIVE").toUpperCase();
    const timestamp = now();
    const statusFields = status === "ACTIVE"
      ? { status, unsuspendedAt: timestamp, unsuspendedBy: req.user.uid, suspendedAt: null, blockedAt: null }
      : status === "SUSPENDED"
        ? { status, suspendedAt: timestamp, suspendedBy: req.user.uid }
        : { status, blockedAt: timestamp, blockedBy: req.user.uid };
    await ref.set({ ...statusFields, updatedAt: timestamp, updatedBy: req.user.uid }, { merge: true });
    await audit(req, action, "user", { id, previousStatus, status });
    return res.json({ ok: true, id, previousStatus, status });
  };

  // Owner-only readout of permission and consent history. This is intentionally
  // derived from append-only history/audit collections, never from mutable profile fields.
  app.get("/api/owner/users/:id/permission-history", requireOwner, async (req, res, next) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return res.status(400).json({ error: "Invalid user ID." });
      const profile = await collection("users").doc(id).get();
      if (!profile.exists) return res.status(404).json({ error: "User not found." });
      const [permissionRecords, consentRecords, auditRecords] = await Promise.all([
        read("permissionHistory", 1000),
        read("consentHistory", 1000),
        read("auditLogs", 1000)
      ]);
      const permissions = permissionRecords.filter(record =>
        String(record.userId || record.uid || record.id || "") === id
      );
      const consents = consentRecords.filter(record =>
        String(record.userId || record.uid || record.id || "") === id
      );
      const auditEvents = auditRecords.filter(record => {
        const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
        const action = String(record.action || "");
        if (action === "OWNER_USER_PERMISSION_HISTORY_VIEWED") return false;
        return String(record.userId || "") === id
          || (String(metadata.userId || metadata.id || "") === id
            && /permission|consent|grant|revoke|access/i.test(action));
      });
      const events = [
        ...permissions.map(record => ({ type: "PERMISSION", ...record })),
        ...consents.map(record => ({ type: "CONSENT", ...record })),
        ...auditEvents.map(record => ({ type: "AUDIT", ...record }))
      ].sort((a, b) => {
        const timestamp = (record) => {
          const value = record.createdAtEpochMs ?? record.recordedAtEpochMs ?? record.createdAt ?? record.timestamp;
          if (value && typeof value.toMillis === "function") return value.toMillis();
          const numeric = Number(value || 0);
          return Number.isFinite(numeric) ? numeric : 0;
        };
        return timestamp(b) - timestamp(a);
      });
      await audit(req, "OWNER_USER_PERMISSION_HISTORY_VIEWED", "user", { id, count: events.length });
      return res.json({ userId: id, count: events.length, events, note: "Only records present in configured history/audit collections are included; missing history is not proof that consent was granted." });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/users", requireOwner, async (req, res, next) => {
    try {
      const allUsers = await read("users");
      const query = String(req.query?.q || "").trim().toLowerCase();
      const userId = String(req.query?.userId || "").trim();
      const status = String(req.query?.status || "").trim().toUpperCase();
      const users = allUsers.filter(user => {
        if (userId && user.id !== userId) return false;
        if (status && String(user.status || "ACTIVE").toUpperCase() !== status) return false;
        if (!query) return true;
        return [user.id, user.name, user.displayName, user.email, user.mobile, user.phoneNumber, user.status]
          .some(value => String(value || "").toLowerCase().includes(query));
      });
      res.json({ users, total: users.length, truncated: allUsers.length >= 500 });
    } catch (e) { next(e); }
  });
  app.get("/api/owner/users/:id/export", requireOwner, async (req, res, next) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return res.status(400).json({ error: "Invalid user ID." });
      const profile = await collection("users").doc(id).get();
      if (!profile.exists) return res.status(404).json({ error: "User not found." });
      const relatedCollections = ["subscriptions", "payments", "supportTickets", "freeAccessGrants"];
      const related = {};
      for (const name of relatedCollections) {
        const byUserId = await collection(name).where("userId", "==", id).limit(500).get();
        const byUid = await collection(name).where("uid", "==", id).limit(500).get();
        const unique = new Map();
        for (const doc of [...byUserId.docs, ...byUid.docs]) unique.set(doc.id, { id: doc.id, ...doc.data() });
        related[name] = Array.from(unique.values());
      }
      const exportedAt = new Date(now()).toISOString();
      await audit(req, "OWNER_USER_DATA_EXPORTED", "user", { id, collections: ["users", ...relatedCollections] });
      res.set("Content-Disposition", `attachment; filename="family-suraksha-user-${id}-export.json"`);
      return res.json({ userId: id, exportedAt, data: { profile: { id, ...profile.data() }, ...related } });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/users/:id", requireOwner, (req, res, next) => updateUserProfile(req, res).catch(next));
  app.post("/api/owner/users/:id/suspend", requireOwner, async (req, res, next) => {
    try { await setUserStatus(req, res, "SUSPENDED", "OWNER_USER_SUSPENDED"); } catch (e) { next(e); }
  });
  app.post("/api/owner/users/:id/unsuspend", requireOwner, async (req, res, next) => {
    try { await setUserStatus(req, res, "ACTIVE", "OWNER_USER_UNSUSPENDED"); } catch (e) { next(e); }
  });
  app.post("/api/owner/users/:id/block", requireOwner, async (req, res, next) => {
    try { await setUserStatus(req, res, "BLOCKED", "OWNER_USER_BLOCKED"); } catch (e) { next(e); }
  });
  app.post("/api/owner/users/:id/unblock", requireOwner, async (req, res, next) => {
    try { await setUserStatus(req, res, "ACTIVE", "OWNER_USER_UNBLOCKED"); } catch (e) { next(e); }
  });
  // Backward-compatible alias for existing Owner UI clients.
  app.post("/api/owner/users/:id/ban", requireOwner, async (req, res, next) => {
    try { await setUserStatus(req, res, "BLOCKED", "OWNER_USER_BLOCKED"); } catch (e) { next(e); }
  });
  app.delete("/api/owner/users/:id", requireOwner, async (req, res, next) => {
    try {
      // A Firestore profile delete is not a complete account deletion: it does
      // not revoke Firebase Authentication or apply the data-retention policy.
      // Fail closed until a configured deletion workflow can perform that work.
      await audit(req, "OWNER_USER_DELETION_BLOCKED", "user", { id: req.params.id, reason: "DELETION_WORKFLOW_NOT_CONFIGURED" });
      res.status(501).json({ error: "Account deletion is not enabled until the authenticated-account deletion and data-retention workflow is configured. No user data was deleted." });
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

  app.get("/api/owner/device-links", requireOwner, async (req, res, next) => {
    try {
      const snap = await collection("pairingCodes").where("ownerUid", "==", req.user.uid).limit(500).get();
      const links = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ links });
    } catch (e) { next(e); }
  });
  app.post("/api/owner/device-links/generate", requireOwner, async (req, res, next) => {
    try {
      const planId = String(req.body?.planId || "").trim();
      if (!planId) return res.status(400).json({ error: "planId is required." });
      const planSnap = await collection("plans").doc(planId).get();
      if (!planSnap.exists || planSnap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      const validity = getLinkValidity({ id: planSnap.id, ...planSnap.data() });
      if (!validity) return res.status(400).json({ error: "Plan device-link validity is not configured." });
      const code = crypto.randomBytes(8).toString("base64url").slice(0, 11).toUpperCase();
      const createdAt = now();
      const expiresAt = calculateExpiry(createdAt, validity);
      await collection("pairingCodes").doc(code).set({ ownerUid: req.user.uid, status: "PENDING", createdAt, expiresAt, planId, linkValidityValue: validity.value, linkValidityUnit: validity.unit });
      await audit(req, "OWNER_DEVICE_LINK_GENERATED", "pairingCode", { planId, expiresAt });
      res.status(201).json({ ok: true, code, planId, expiresAt });
    } catch (e) { next(e); }
  });
  app.post("/api/owner/device-links/regenerate/:code", requireOwner, async (req, res, next) => {
    try {
      const oldCode = String(req.params.code || "").trim().toUpperCase();
      const oldRef = collection("pairingCodes").doc(oldCode);
      const oldSnap = await oldRef.get();
      if (!oldSnap.exists || oldSnap.data()?.ownerUid !== req.user.uid) return res.status(404).json({ error: "Device link not found." });
      const planId = String(oldSnap.data()?.planId || req.body?.planId || "").trim();
      if (!planId) return res.status(400).json({ error: "planId is required." });
      const planSnap = await collection("plans").doc(planId).get();
      if (!planSnap.exists || planSnap.data()?.enabled !== true) return res.status(404).json({ error: "Plan not found." });
      const validity = getLinkValidity({ id: planSnap.id, ...planSnap.data() });
      if (!validity) return res.status(400).json({ error: "Plan device-link validity is not configured." });
      await oldRef.set({ status: "REVOKED", revokedAt: now(), updatedAt: now() }, { merge: true });
      const code = crypto.randomBytes(8).toString("base64url").slice(0, 11).toUpperCase();
      const createdAt = now();
      const expiresAt = calculateExpiry(createdAt, validity);
      await collection("pairingCodes").doc(code).set({ ownerUid: req.user.uid, status: "PENDING", createdAt, expiresAt, planId, linkValidityValue: validity.value, linkValidityUnit: validity.unit });
      await audit(req, "OWNER_DEVICE_LINK_REGENERATED", "pairingCode", { oldCode, planId, expiresAt });
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

  app.get("/api/owner/catalog-features", requireOwner, async (req, res, next) => {
    try {
      const [policySnap, settingsSnap] = await Promise.all([
        collection("featurePolicy").doc("global").get(),
        collection("ownerSettings").doc("global").get()
      ]);
      const policy = policySnap.exists ? policySnap.data() || {} : {};
      const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
      const globalOverrides = policy.globalFeatureOverrides || settings.masterConfig?.access?.globalFeatureOverrides || {};
      const overrides = policy.featureOverrides || settings.featureOverrides || {};
      res.json({ features: FEATURES.map(feature => ({
        id: feature.key, key: feature.key, catalogId: feature.id,
        name: feature.name, description: feature.description,
        enabled: typeof overrides[feature.key] === "boolean" ? overrides[feature.key]
          : typeof globalOverrides[feature.key] === "boolean" ? globalOverrides[feature.key]
          : typeof globalOverrides[feature.key]?.enabled === "boolean" ? globalOverrides[feature.key].enabled
          : true
      })) });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/catalog-features/:key", requireOwner, async (req, res, next) => {
    try {
      const key = String(req.params.key || "").trim().toUpperCase();
      if (!FEATURES.some(feature => feature.key === key)) return res.status(404).json({ error: "Feature not found in the canonical 19-feature catalog." });
      if (typeof req.body?.values?.enabled !== "boolean") return res.status(400).json({ error: "values.enabled must be a boolean." });
      const enabled = req.body.values.enabled;
      const policyRef = collection("featurePolicy").doc("global");
      const settingsRef = collection("ownerSettings").doc("global");
      await Promise.all([
        policyRef.set({ featureOverrides: { [key]: enabled }, globalFeatureOverrides: { [key]: enabled } }, { merge: true }),
        settingsRef.set({
          featureOverrides: { [key]: { enabled, maxDurationSeconds: null, priority: 0 } },
          masterConfig: { access: { globalFeatureOverrides: { [key]: { enabled, maxDurationSeconds: null, priority: 0 } } } }
        }, { merge: true })
      ]);
      await audit(req, "OWNER_CATALOG_FEATURE_TOGGLED", "feature", { key, enabled });
      res.json({ ok: true, key, enabled });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/feature-flags", requireOwner, async (req, res, next) => {
    try { res.json({ featureFlags: await read("featureFlags") }); } catch (e) { next(e); }
  });
  app.patch("/api/owner/feature-flags/:id", requireOwner, (req, res, next) => update(req, res, "featureFlags", req.params.id, "featureFlag", "OWNER_FEATURE_FLAG_EDITED").catch(next));

  const sensitiveOwnerSettingKeys = new Set([
    "payment.webhookSecret", "payment.gatewayProviderConfig", "payment.gatewayWebhookSecrets",
    "payment.encryptionKey", "payment.razorpayKeyId", "payment.razorpayKeySecret"
  ]);
  const redactOwnerSettings = (source) => {
    const result = JSON.parse(JSON.stringify(source || {}));
    const editable = result.masterConfig?.ownerControl?.editableValues;
    if (editable && typeof editable === "object") {
      for (const key of sensitiveOwnerSettingKeys) {
        if (Object.prototype.hasOwnProperty.call(editable, key) && editable[key]) editable[key] = "[REDACTED]";
      }
    }
    return result;
  };

  // The Android app's canonical settings document is ownerSettings/global.
  // Keep the existing schema intact so web edits apply to the same live config.
  app.get("/api/owner/settings", requireOwner, async (req, res, next) => {
    try {
      const snap = await collection("ownerSettings").doc("global").get();
      res.json({ settings: redactOwnerSettings(snap.exists ? snap.data() : {}) });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/settings", requireOwner, async (req, res, next) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return res.status(400).json({ error: "values object is required." });
      const ref = collection("ownerSettings").doc("global");
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? existingSnap.data() || {} : {};
      const nextValues = JSON.parse(JSON.stringify(values));
      const submittedEditable = nextValues.masterConfig?.ownerControl?.editableValues;
      const existingEditable = existing.masterConfig?.ownerControl?.editableValues || {};
      if (submittedEditable && typeof submittedEditable === "object") {
        for (const key of sensitiveOwnerSettingKeys) {
          if (Object.prototype.hasOwnProperty.call(existingEditable, key)) {
            // Redacted values are display-only; never replace the server secret with a marker.
            submittedEditable[key] = existingEditable[key];
          } else if (submittedEditable[key] === "[REDACTED]") {
            delete submittedEditable[key];
          }
        }
      }
      await ref.set({ ...nextValues, updatedAtEpochMs: now(), updatedBy: req.user.uid }, { merge: true });
      const master = nextValues.masterConfig || existing.masterConfig || {};
      const effective = { ...existing, ...nextValues, masterConfig: master };
      const editable = master.ownerControl?.editableValues || {};
      const access = master.access || {};
      const boolValue = (value, fallback = false) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") return value.toLowerCase() === "true";
        return fallback;
      };
      const flagMap = (value) => Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [
        key, typeof item === "boolean" ? item : Boolean(item && typeof item === "object" ? item.enabled : false)
      ]));
      // Keep the client-readable feature policy in sync with the canonical owner config,
      // just as the Android OwnerSettingsRepository does.
      await collection("featurePolicy").doc("global").set({
        globalFeaturesEnabled: boolValue(effective.globalFeaturesEnabled, true),
        globalEnabled: boolValue(access.globalEnabled, true),
        dataCollectionEnabled: boolValue(editable["data.autoCapture"], false),
        dataShareAllowed: boolValue(editable["data.shareAllowed"], false),
        featureOverrides: flagMap(effective.featureOverrides),
        globalFeatureOverrides: flagMap(access.globalFeatureOverrides)
      }, { merge: true });
      const perUser = access.perUser || {};
      for (const [userId, policy] of Object.entries(perUser)) {
        await collection("featurePolicyUsers").doc(userId).set({
          ownerEnabled: policy?.enabled !== false,
          featureOverrides: flagMap(policy?.featureOverrides)
        }, { merge: true });
      }
      if (master.ownerControl?.changeLogEnabled === true) {
        await collection("ownerSettingsHistory").add({
          changedBy: req.user.uid, changedAtEpochMs: now(),
          summary: "OWNER web settings update", settings: redactOwnerSettings(effective)
        });
      }
      await audit(req, "OWNER_GLOBAL_SETTINGS_EDITED", "ownerSettings/global", { topLevelFields: Object.keys(nextValues) });
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
        const dates = normalizeFreeAccessDates({ startsAt: values.startsAt ?? current.data()?.startsAt, endsAt: Object.prototype.hasOwnProperty.call(values, "endsAt") ? values.endsAt : current.data()?.endsAt });
        if (dates.endsAt !== null && dates.endsAt <= now()) return res.status(400).json({ error: "endsAt must be in the future." });
        nextValues.startsAt = dates.startsAt;
        nextValues.endsAt = dates.endsAt;
      }
      if (Object.prototype.hasOwnProperty.call(values, "all19") || Object.prototype.hasOwnProperty.call(values, "allPermissions") || Object.prototype.hasOwnProperty.call(values, "features")) Object.assign(nextValues, normalizeFeatures(values));
      await collection("freeAccessGrants").doc(req.params.id).set({ ...nextValues, status: "ACTIVE", updatedAt: now(), updatedBy: req.user.uid }, { merge: true });
      await audit(req, "OWNER_FREE_ACCESS_EDITED", "freeAccessGrant", { id: req.params.id, changedFields: Object.keys(nextValues) });
      res.json({ ok: true, id: req.params.id, status: "ACTIVE", ...nextValues });
    } catch (e) { if (e.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
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
  app.patch("/api/owner/payments/:id", requireOwner, async (req, res, next) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return res.status(400).json({ error: "A payment metadata object is required." });
      }
      const allowedFields = new Set(["ownerNote", "reconciliationNote"]);
      if (Object.keys(values).some(key => !allowedFields.has(key))) {
        return res.status(400).json({ error: "Payment status, amount, owner and provider references are immutable through the owner REST API; use verified billing actions." });
      }
      for (const value of Object.values(values)) {
        if (typeof value !== "string" || value.length > 1000) {
          return res.status(400).json({ error: "Payment notes must be text up to 1000 characters." });
        }
      }
      const ref = collection("payments").doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Payment not found." });
      const patch = { ...values, updatedAt: now(), updatedBy: req.user.uid };
      await ref.set(patch, { merge: true });
      await audit(req, "OWNER_PAYMENT_NOTE_UPDATED", "payment", { id: req.params.id, fields: Object.keys(values) });
      return res.json({ id: req.params.id, ...patch });
    } catch (error) {
      return next(error);
    }
  });
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


  app.get("/api/owner/profile", requireOwner, async (req, res, next) => {
    try {
      const snap = await collection("ownerSettings").doc("global").get();
      const settings = snap.exists ? snap.data() || {} : {};
      const profile = settings.ownerProfile && typeof settings.ownerProfile === "object" ? settings.ownerProfile : {};
      res.json({
        displayName: String(profile.displayName || ""),
        contactEmail: String(profile.contactEmail || ""),
        contactMobile: String(profile.contactMobile || ""),
        updatedAtEpochMs: Number(profile.updatedAtEpochMs || 0)
      });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/profile", requireOwner, async (req, res, next) => {
    try {
      const displayName = String(req.body?.displayName || "").trim();
      const contactEmail = String(req.body?.contactEmail || "").trim().toLowerCase();
      const rawMobile = String(req.body?.contactMobile || "").trim();
      const contactMobile = rawMobile ? rawMobile.replace(/[^0-9+]/g, "") : "";
      if (displayName.length < 2 || displayName.length > 80) return res.status(400).json({ error: "Display name must be 2–80 characters." });
      if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return res.status(400).json({ error: "Enter a valid contact email address." });
      if (contactMobile && !/^\+?[0-9]{10,15}$/.test(contactMobile)) return res.status(400).json({ error: "Enter a valid contact mobile number with country code." });
      const updatedAtEpochMs = now();
      await collection("ownerSettings").doc("global").set({
        ownerProfile: { displayName, contactEmail, contactMobile, updatedAtEpochMs, updatedBy: req.user.uid }
      }, { merge: true });
      await audit(req, "OWNER_PROFILE_UPDATED", "ownerSettings/global", { fields: ["displayName", "contactEmail", "contactMobile"] });
      res.json({ ok: true, displayName, contactEmail, contactMobile, updatedAtEpochMs });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/support-settings", requireOwner, async (req, res, next) => {
    try {
      const snap = await collection("ownerSettings").doc("global").get();
      const settings = snap.exists ? snap.data() || {} : {};
      const configuredInSettings = Object.prototype.hasOwnProperty.call(settings.support || {}, "whatsappNumber");
      const value = configuredInSettings ? settings.support?.whatsappNumber : process.env.SUPPORT_WHATSAPP_NUMBER;
      const { normalizeSupportNumber } = require("./support-whatsapp");
      const whatsappNumber = normalizeSupportNumber(value) || "";
      res.json({ configured: Boolean(whatsappNumber), whatsappNumber, source: configuredInSettings ? "OWNER_SETTINGS" : (whatsappNumber ? "ENVIRONMENT" : "UNCONFIGURED") });
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/support-settings", requireOwner, async (req, res, next) => {
    try {
      const { normalizeSupportNumber } = require("./support-whatsapp");
      const raw = String(req.body?.whatsappNumber || "").trim();
      const whatsappNumber = normalizeSupportNumber(raw);
      if (!whatsappNumber) return res.status(400).json({ error: "Enter a valid WhatsApp number with country code (10–15 digits)." });
      await collection("ownerSettings").doc("global").set({
        support: { whatsappNumber },
        updatedAtEpochMs: now(), updatedBy: req.user.uid
      }, { merge: true });
      await audit(req, "OWNER_SUPPORT_WHATSAPP_UPDATED", "ownerSettings/global", { field: "support.whatsappNumber", digits: whatsappNumber.length });
      res.json({ ok: true, configured: true, whatsappNumber, source: "OWNER_SETTINGS" });
    } catch (e) { next(e); }
  });


  // Customer-facing business profile. This never changes authentication identity
  // or the server-side OWNER allowlist.
  app.get("/api/owner/business-settings", requireOwner, async (_req, res, next) => {
    try {
      const snap = await collection("ownerSettings").doc("global").get();
      const root = snap.exists ? snap.data() || {} : {};
      const saved = root.masterConfig?.ownerControl?.businessProfile || {};
      res.json({ businessSettings: {
        brandName: String(saved.brandName || "Family Suraksha"),
        supportWhatsAppNumber: String(saved.supportWhatsAppNumber || root.support?.whatsappNumber || process.env.SUPPORT_WHATSAPP_NUMBER || ""),
        supportWhatsAppMessage: String(saved.supportWhatsAppMessage || "Hello, I need support for Family Suraksha"),
        supportEmail: String(saved.supportEmail || ""),
        supportUrl: String(saved.supportUrl || "")
      }});
    } catch (e) { next(e); }
  });
  app.patch("/api/owner/business-settings", requireOwner, async (req, res, next) => {
    try {
      const values = req.body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return res.status(400).json({ error: "values object is required." });
      }
      const brandName = String(values.brandName || "").trim();
      if (brandName.length < 2 || brandName.length > 100) {
        return res.status(400).json({ error: "Brand name must be 2–100 characters." });
      }
      const rawNumber = String(values.supportWhatsAppNumber || "").trim();
      const supportWhatsAppNumber = rawNumber.replace(/\D/g, "");
      if (!/^\d{8,15}$/.test(supportWhatsAppNumber)) {
        return res.status(400).json({ error: "A WhatsApp number with 8–15 digits including country code is required." });
      }
      const supportWhatsAppMessage = String(values.supportWhatsAppMessage || ("Hello, I need support for " + brandName)).trim().slice(0, 500);
      const supportEmail = String(values.supportEmail || "").trim().toLowerCase();
      if (supportEmail && (supportEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail))) {
        return res.status(400).json({ error: "supportEmail is invalid." });
      }
      const supportUrl = String(values.supportUrl || "").trim();
      if (supportUrl) {
        let parsed;
        try { parsed = new URL(supportUrl); } catch (_) { return res.status(400).json({ error: "supportUrl must be a valid HTTPS URL." }); }
        if (parsed.protocol !== "https:" || supportUrl.length > 500) {
          return res.status(400).json({ error: "supportUrl must be a valid HTTPS URL no longer than 500 characters." });
        }
      }
      const businessProfile = {
        brandName, supportWhatsAppNumber, supportWhatsAppMessage, supportEmail, supportUrl,
        updatedAt: now(), updatedBy: req.user.uid
      };
      await collection("ownerSettings").doc("global").set({
        masterConfig: { ownerControl: { businessProfile } },
        support: { whatsappNumber: supportWhatsAppNumber },
        updatedAtEpochMs: now(), updatedBy: req.user.uid
      }, { merge: true });
      await audit(req, "OWNER_BUSINESS_SETTINGS_EDITED", "businessProfile", {
        changedFields: Object.keys(values).filter(key => ["brandName", "supportWhatsAppNumber", "supportWhatsAppMessage", "supportEmail", "supportUrl"].includes(key))
      });
      res.json({ ok: true, businessSettings: { brandName, supportWhatsAppNumber, supportWhatsAppMessage, supportEmail, supportUrl } });
    } catch (e) { next(e); }
  });

  app.get("/api/owner/health", requireOwner, async (req, res) => {
    res.json({ ok: true, service: "smart-control-backend", checkedAt: now() });
  });
}

module.exports = { installOwnerPanelRoutes };
