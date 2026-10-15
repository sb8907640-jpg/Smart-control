const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn("http://127.0.0.1:" + port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function makeOwnerTestDb() {
  const data = {
    users: new Map([
      ["user-1", { name: "Test User", email: "user@example.test", status: "ACTIVE", role: "USER" }],
      ["owner-1", { name: "Owner", email: "owner@example.test", status: "ACTIVE", role: "OWNER" }]
    ]),
    ownerSettings: new Map([["global", {}]]),
    auditLogs: [],
    securityEvents: [],
    subscriptions: new Map([["sub-1", { userId: "user-1", status: "ACTIVE" }]]),
    payments: new Map([["payment-1", { userId: "user-1", amount: 100 }]]),
    supportTickets: new Map([["ticket-1", { userId: "user-1", status: "OPEN" }]]),
    freeAccessGrants: new Map(),
    permissionHistory: new Map(),
    consentHistory: new Map()
  };
  return {
    data,
    collection(name) {
      const rows = data[name] instanceof Map ? data[name] : null;
      return {
        doc(id) {
          return {
            async get() {
              const value = rows?.get(id);
              return { exists: value !== undefined, data: () => value ? { ...value } : undefined };
            },
            async set(value, options = {}) {
              if (!rows) throw new Error("Unexpected collection write: " + name);
              rows.set(id, options.merge ? { ...(rows.get(id) || {}), ...value } : { ...value });
            },
            async delete() { rows?.delete(id); }
          };
        },
        async add(value) {
          if (name === "supportTickets" && rows) {
            const id = "ticket-" + (rows.size + 1);
            rows.set(id, { ...value });
            return { id };
          }
          if (name !== "auditLogs" && name !== "securityEvents") throw new Error("Unexpected collection add: " + name);
          const list = data[name];
          list.push({ id: name + "-" + (list.length + 1), ...value });
          return { id: name + "-" + list.length };
        },
        where(field, operator, value) {
          const filters = [[field, operator, value]];
          const query = {
            where(nextField, nextOperator, nextValue) { filters.push([nextField, nextOperator, nextValue]); return query; },
            limit(max) {
              return { async get() {
                let entries = rows ? Array.from(rows.entries()) : [];
                entries = entries.filter(([, record]) => filters.every(([key, op, expected]) => {
                  if (op === "==") return record[key] === expected;
                  if (op === ">=") return Number(record[key] || 0) >= Number(expected);
                  throw new Error("Unsupported test query operator: " + op);
                }));
                if (Number.isFinite(max)) entries = entries.slice(0, max);
                const docs = entries.map(([id, record]) => ({ id, data: () => ({ ...record }) }));
                return { docs, size: docs.length, empty: docs.length === 0 };
              } };
            }
          };
          return query;
        },
        limit() {
          return { async get() {
            const docs = rows ? Array.from(rows.entries()).map(([id, value]) => ({ id, data: () => ({ ...value }) })) : [];
            return { docs };
          } };
        }
      };
    }
  };
}

async function withOwnerServer(db, fn) {
  const previous = process.env.OWNER_EMAILS;
  process.env.OWNER_EMAILS = "owner@example.test";
  try {
    const app = createApp({
      db,
      verifyIdToken: async () => ({
        uid: "owner-1",
        email: "owner@example.test",
        auth_time: Math.floor(Date.now() / 1000)
      })
    });
    await withServer(app, fn);
  } finally {
    if (previous === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = previous;
  }
}

test("health and readiness endpoints are public", async () => {
  const app = createApp();
  await withServer(app, async base => {
    const health = await fetch(base + "/healthz");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const ready = await fetch(base + "/readyz");
    assert.equal(ready.status, 503);
    const readyBody = await ready.json();
    assert.equal(readyBody.ok, false);
    assert.equal(readyBody.checks.firebase, false);
  });
});

test("protected API rejects requests without bearer authentication", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "u1" }) });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/auth/session");
    assert.equal(response.status, 401);
  });
});

test("protected API accepts a verified Firebase identity", async () => {
  const app = createApp({ verifyIdToken: async token => {
    assert.equal(token, "test-token");
    return { uid: "u1", email: "test@example.invalid", admin: false };
  }});
  await withServer(app, async base => {
    const response = await fetch(base + "/api/auth/session", {
      headers: { authorization: "Bearer test-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uid, "u1");
    assert.equal(body.authenticated, true);
  });
});

test("plan route fails closed when Firestore is unavailable", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "u1" }) });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/plans", {
      headers: { authorization: "Bearer test-token" }
    });
    assert.equal(response.status, 503);
  });
});


test("health endpoint fails closed for production without residency configuration", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRegion = process.env.SMARTCONTROL_DATA_REGION;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SMARTCONTROL_DATA_REGION;
    const app = createApp();
    await withServer(app, async base => {
      const response = await fetch(base + "/healthz");
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.residency, null);
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousRegion === undefined) delete process.env.SMARTCONTROL_DATA_REGION; else process.env.SMARTCONTROL_DATA_REGION = previousRegion;
  }
});


test("pairing invitation requires valid relationship selections", async () => {
  const app = createApp({
    verifyIdToken: async () => ({ uid: "sender-1" }),
    db: {}
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/pairing/invites", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ senderRole: "Unknown", receiverRole: "Son" })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /valid sender and receiver/i);
  });
});

test("pairing invitation verification requires authentication", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "receiver-1" }), db: {} });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/pairing/invites/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "some-token", code: "123456" })
    });
    assert.equal(response.status, 401);
  });
});

test("pairing acceptance requires authentication", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "receiver-1" }), db: {} });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/pairing/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(43), code: "123456", consent: true })
    });
    assert.equal(response.status, 401);
  });
});

test("pairing acceptance fails closed without explicit receiver consent", async () => {
  const app = createApp({ verifyIdToken: async () => ({ uid: "receiver-1" }), db: {} });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/pairing/invites/accept", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ token: "a".repeat(43), code: "123456", consent: false })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /explicit receiver consent/i);
  });
});



test("Owner business profile validates fields, persists privately, and audits changes", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const bad = await fetch(base + "/api/owner/business-settings", {
      method: "PATCH",
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      body: JSON.stringify({ values: { brandName: "FS", supportUrl: "http://insecure.example.test" } })
    });
    assert.equal(bad.status, 400);
    const response = await fetch(base + "/api/owner/business-settings", {
      method: "PATCH",
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      body: JSON.stringify({ values: {
        brandName: "Family Suraksha",
        supportWhatsAppNumber: "+91 98765 43210",
        supportWhatsAppMessage: "Hello support",
        supportEmail: "help@example.test",
        supportUrl: "https://support.example.test"
      } })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.businessSettings.supportWhatsAppNumber, "919876543210");
    assert.equal(db.data.ownerSettings.get("global").masterConfig.ownerControl.businessProfile.brandName, "Family Suraksha");
    assert.equal(db.data.auditLogs.at(-1).action, "OWNER_BUSINESS_SETTINGS_EDITED");
  });
});

test("WhatsApp support endpoint uses private Owner destination and creates a ticket", async () => {
  const db = makeOwnerTestDb();
  db.data.ownerSettings.set("global", { masterConfig: { ownerControl: { businessProfile: {
    brandName: "Family Suraksha",
    supportWhatsAppNumber: "919876543210",
    supportWhatsAppMessage: "Hello from Family Suraksha"
  } } } });
  await withOwnerServer(db, async base => {
    let body;
    for (let i = 0; i < 3; i++) {
      const response = await fetch(base + "/api/support/whatsapp/initiate", {
        method: "POST", headers: { authorization: "Bearer owner-token" }
      });
      assert.equal(response.status, 201);
      body = await response.json();
    }
    assert.match(body.whatsappUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
    assert.equal(body.channel, "WHATSAPP");
    assert.equal(db.data.supportTickets.size, 4);
    assert.equal(db.data.auditLogs.filter(log => log.action === "SUPPORT_WHATSAPP_INITIATED").length, 3);
    const throttled = await fetch(base + "/api/support/whatsapp/initiate", {
      method: "POST", headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(throttled.status, 429);
  });
});

test("Owner user profile editing rejects role and account-status escalation", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1", {
      method: "PATCH",
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      body: JSON.stringify({ values: { role: "OWNER", admin: true, status: "ACTIVE" } })
    });
    assert.equal(response.status, 400);
    assert.equal(db.data.users.get("user-1").role, "USER");
    assert.equal(db.data.users.get("user-1").admin, undefined);
    assert.equal(db.data.auditLogs.length, 0);
  });
});

test("Owner can edit allowlisted profile fields and audit the change", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1", {
      method: "PATCH",
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      body: JSON.stringify({ values: { name: "Updated User", email: "updated@example.test" } })
    });
    assert.equal(response.status, 200);
    assert.equal(db.data.users.get("user-1").name, "Updated User");
    assert.equal(db.data.users.get("user-1").email, "updated@example.test");
    assert.equal(db.data.auditLogs.length, 1);
    assert.equal(db.data.auditLogs[0].action, "OWNER_USER_PROFILE_EDITED");
    assert.equal(db.data.auditLogs[0].userId, "owner-1");
  });
});

test("Owner suspend, unsuspend, block, and unblock actions update status and audit each transition", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    for (const [action, expected] of [
      ["suspend", "SUSPENDED"], ["unsuspend", "ACTIVE"],
      ["block", "BLOCKED"], ["unblock", "ACTIVE"]
    ]) {
      const response = await fetch(base + "/api/owner/users/user-1/" + action, {
        method: "POST",
        headers: { authorization: "Bearer owner-token" }
      });
      assert.equal(response.status, 200, action);
      assert.equal((await response.json()).status, expected);
      assert.equal(db.data.users.get("user-1").status, expected);
    }
    assert.deepEqual(db.data.auditLogs.map(log => log.action), [
      "OWNER_USER_SUSPENDED", "OWNER_USER_UNSUSPENDED", "OWNER_USER_BLOCKED", "OWNER_USER_UNBLOCKED"
    ]);
  });
});

test("Owner account deletion fails closed until authenticated deletion and retention are configured", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1", {
      method: "DELETE",
      headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(response.status, 501);
    assert.equal(db.data.users.has("user-1"), true);
    assert.equal(db.data.auditLogs[0].action, "OWNER_USER_DELETION_BLOCKED");
  });
});



test("Owner permission history sorts server-recorded consent events by timestamp", async () => {
  const db = makeOwnerTestDb();
  db.data.consentHistory.set("consent-old", { userId: "user-1", consentVersion: 1, recordedAtEpochMs: 100 });
  db.data.consentHistory.set("consent-new", { userId: "user-1", consentVersion: 2, recordedAtEpochMs: 300 });
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1/permission-history", {
      headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const consentEvents = body.events.filter(event => event.type === "CONSENT");
    assert.deepEqual(consentEvents.map(event => event.id), ["consent-new", "consent-old"]);
  });
});

test("Owner user list supports status and identity-field filters", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users?q=owner&status=ACTIVE", {
      headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 1);
    assert.equal(body.users[0].id, "owner-1");
    assert.equal(body.users[0].status, "ACTIVE");
  });
});

test("Owner user data export includes scoped records and writes an audit event", async () => {
  const db = makeOwnerTestDb();
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1/export", {
      headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") || "", /attachment/);
    const body = await response.json();
    assert.equal(body.userId, "user-1");
    assert.equal(body.data.profile.name, "Test User");
    assert.equal(body.data.subscriptions.length, 1);
    assert.equal(body.data.payments.length, 1);
    assert.equal(body.data.supportTickets.length, 1);
    assert.equal(db.data.auditLogs[0].action, "OWNER_USER_DATA_EXPORTED");
  });
});


test("suspended and blocked accounts are rejected by backend authentication and logged", async () => {
  const db = makeOwnerTestDb();
  db.data.users.set("blocked-1", { name: "Blocked", status: "BLOCKED" });
  const app = createApp({
    db,
    verifyIdToken: async () => ({ uid: "blocked-1", email: "blocked@example.test" })
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/auth/session", {
      headers: { authorization: "Bearer blocked-token" }
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /suspended or blocked/i);
    assert.equal(db.data.securityEvents.length, 1);
    assert.equal(db.data.securityEvents[0].event, "AUTH_REJECTED_ACCOUNT_STATUS");
    assert.equal(db.data.securityEvents[0].userId, "blocked-1");
  });
});


test("ordinary authenticated users cannot access Owner management APIs", async () => {
  const db = makeOwnerTestDb();
  const app = createApp({
    db,
    verifyIdToken: async () => ({ uid: "ordinary-1", email: "ordinary@example.test" })
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/owner/users", {
      headers: { authorization: "Bearer ordinary-token" }
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /OWNER access required/i);
  });
});


test("Owner permission history returns scoped permission, consent, and audit events", async () => {
  const db = makeOwnerTestDb();
  db.data.permissionHistory.set("permission-1", { userId: "user-1", permission: "LOCATION", granted: true, createdAtEpochMs: 1000 });
  db.data.consentHistory.set("consent-1", { userId: "user-1", consentVersion: "v1", accepted: true, createdAtEpochMs: 2000 });
  db.data.permissionHistory.set("permission-other", { userId: "other-user", permission: "CAMERA", granted: true, createdAtEpochMs: 3000 });
  await withOwnerServer(db, async base => {
    const response = await fetch(base + "/api/owner/users/user-1/permission-history", {
      headers: { authorization: "Bearer owner-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.userId, "user-1");
    assert.equal(body.count, 2);
    assert.deepEqual(new Set(body.events.map(event => event.type)), new Set(["PERMISSION", "CONSENT"]));
    assert.ok(body.events.every(event => event.userId === "user-1"));
    assert.match(body.note, /not proof that consent was granted/i);
    assert.equal(db.data.auditLogs[0].action, "OWNER_USER_PERMISSION_HISTORY_VIEWED");
  });
});

test("legacy direct-connect endpoint cannot bypass consent-based pairing", async () => {
  const app = createApp({
    verifyIdToken: async () => ({ uid: "attacker-1", email: "attacker@example.test" })
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/connect", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "victim-device" })
    });
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /consent-based pairing/i);
  });
});

test("legacy link join requires explicit receiver consent before accessing pairing data", async () => {
  const app = createApp({
    verifyIdToken: async () => ({ uid: "receiver-1", email: "receiver@example.test" })
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/link/join", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCD1234" })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /explicit receiver consent/i);
  });
});

test("disconnect and reconnect reject devices unrelated to the authenticated user", async () => {
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === "users") return { exists: false, data: () => undefined };
              if (name === "devices" && id === "victim-device") {
                return { exists: true, data: () => ({ controllerUid: "victim-controller", pairingActive: true }) };
              }
              return { exists: false, data: () => undefined };
            }
          };
        }
      };
    }
  };
  const app = createApp({
    db,
    verifyIdToken: async () => ({ uid: "attacker-1", email: "attacker@example.test" })
  });
  await withServer(app, async base => {
    for (const route of ["/api/disconnect", "/api/reconnect"]) {
      const response = await fetch(base + route, {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "victim-device" })
      });
      assert.equal(response.status, 404, route);
    }
  });
});
