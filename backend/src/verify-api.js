const assert = require("node:assert/strict");
const { createApp } = require("./app");
const { API } = require("../../functions/spec/masterCatalog");

class MemoryFirestore {
  constructor(seed = {}) {
    this.data = new Map();
    for (const [collection, docs] of Object.entries(seed)) {
      this.data.set(collection, new Map(Object.entries(docs)));
    }
  }
  collection(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return new MemoryCollection(this, name);
  }
  batch() { return new MemoryBatch(this); }
}
class MemoryBatch {
  constructor(db) { this.db = db; this.ops = []; }
  set(ref, value, options = {}) { this.ops.push(() => ref.set(value, options)); }
  async commit() { for (const op of this.ops) await op(); }
}
class MemoryCollection {
  constructor(db, name) { this.db = db; this.name = name; }
  _map() { return this.db.data.get(this.name); }
  doc(id) {
    const key = id || ("doc-" + Math.random().toString(36).slice(2, 10));
    return new MemoryDoc(this.db, this.name, key);
  }
  async add(value) {
    const ref = this.doc();
    await ref.set(value);
    return ref;
  }
  where(field, op, value) { return new MemoryQuery(this.db, this.name, [[field, op, value]]); }
  orderBy() { return new MemoryQuery(this.db, this.name, []); }
  limit(n) { return new MemoryQuery(this.db, this.name, []).limit(n); }
  count() { return { get: async () => ({ data: () => ({ count: this._map().size }) }) }; }
  async get() { return new MemoryQuery(this.db, this.name, []).get(); }
}
class MemoryQuery {
  constructor(db, name, filters) { this.db = db; this.name = name; this.filters = filters; this.max = null; }
  where(field, op, value) { return new MemoryQuery(this.db, this.name, this.filters.concat([[field, op, value]])).limit(this.max); }
  orderBy() { return this; }
  limit(n) { this.max = n; return this; }
  async get() {
    let rows = [...this.db.data.get(this.name).entries()];
    rows = rows.filter(([, d]) => this.filters.every(([field, op, value]) => {
      if (op === "in") return Array.isArray(value) && value.includes(d?.[field]);
      return d?.[field] === value;
    }));
    if (this.max != null) rows = rows.slice(0, this.max);
    return {
      empty: rows.length === 0,
      docs: rows.map(([id, data]) => ({ id, data: () => ({ ...data }), ref: new MemoryDoc(this.db, this.name, id) }))
    };
  }
}
class MemoryDoc {
  constructor(db, name, id) { this.db = db; this.name = name; this.id = id; }
  async get() {
    const data = this.db.data.get(this.name).get(this.id);
    return { exists: data !== undefined, id: this.id, data: () => data ? { ...data } : undefined };
  }
  async set(value, options = {}) {
    const map = this.db.data.get(this.name);
    const old = map.get(this.id) || {};
    map.set(this.id, options.merge ? { ...old, ...value } : { ...value });
  }
}
function seedDb() {
  return new MemoryFirestore({
    users: { "user-1": { uid: "user-1", status: "ACTIVE" } },
    devices: { "device-1": { userId: "user-1", controllerUid: "user-1", targetDeviceId: "device-1", connectionStatus: "CONNECTED" } },
    plans: { "plan-1": { enabled: true, displayOrder: 1, name: "Test Plan", priceMinor: 29900, durationValue: 1, durationUnit: "MONTHS", linkValidityValue: 10, linkValidityUnit: "MINUTES", features: ["CAMERA"] } },
    consentLogs: { "consent-1": { userId: "user-1", granted: true, scope: ["ALL"], version: "test" } },
    permissionGrants: { "permission-1": { userId: "user-1", permission: "CAMERA", granted: true } },
    mediaSessions: { "session-1": { controllerUid: "user-1", targetDeviceId: "device-1", status: "ACTIVE", consentGranted: true } },
    pairingCodes: { "JOIN-CODE": { ownerUid: "user-1", status: "PENDING", expiresAt: Date.now() + 600000 } },
    subscriptions: { "sub-1": { userId: "user-1", planId: "plan-1", status: "ACTIVE" } },
    payments: { "payment-1": { userId: "user-1", subscriptionId: "sub-1", amountMinor: 100, status: "INITIATED" } },
    sosAlerts: { "sos-1": { userId: "user-1", status: "TRIGGERED" } },
    freeAccessGrants: { "grant-1": { userId: "user-1", status: "ACTIVE" } }
  });
}
function pathFor(endpoint) {
  if (endpoint.startsWith("/api/devices/:id")) return "/api/devices/device-1";
  if (endpoint.startsWith("/api/permissions/:id")) return "/api/permissions/permission-1";
  if (endpoint.startsWith("/api/plans/:id")) return "/api/plans/plan-1";
  return endpoint;
}
function requestBody(endpoint) {
  if (endpoint.includes("/link/join")) return { code: "JOIN-CODE" };
  if (endpoint.includes("/link/share")) return { link: "https://example.invalid/share/test" };
  if (/\/api\/(connect|disconnect|reconnect)$/.test(endpoint)) return { deviceId: "device-1" };
  if (endpoint.includes("/permissions/request") || endpoint.includes("/permissions/grant") || endpoint.includes("/permissions/revoke")) return { permission: "CAMERA" };
  if (endpoint.includes("/permissions/allow-all")) return {};
  if (endpoint.includes("/consent/save")) return { scope: ["CAMERA", "MICROPHONE"], version: "test" };
  if (endpoint.includes("/consent/verify")) return { consentId: "consent-1" };
  if (endpoint.includes("/control/")) return { sessionId: "session-1", payload: { test: true } };
  if (endpoint.includes("/data/download") || endpoint.includes("/data/share")) return { scope: { test: true } };
  if (endpoint === "/api/subscribe") return { planId: "plan-1" };
  if (endpoint === "/api/payment/initiate") return { subscriptionId: "sub-1", amountMinor: 100, provider: "TEST" };
  if (endpoint === "/api/payment/verify") return { paymentId: "payment-1" };
  if (endpoint === "/api/emi/apply") return { paymentId: "payment-1", installmentCount: 6 };
  if (endpoint.includes("/admin/free-access/grant")) return { userId: "user-2", reason: "integration test" };
  if (endpoint.includes("/admin/free-access/edit") || endpoint.includes("/admin/free-access/revoke")) return { grantId: "grant-1", reason: "integration test" };
  if (endpoint.includes("/admin/user/ban") || endpoint.includes("/admin/user/unban")) return { userId: "user-2" };
  if (endpoint.includes("/admin/system/config")) return { values: { testMode: true } };
  if (endpoint.includes("/support/ticket/create")) return { subject: "Integration test", body: "HTTP verification" };
  if (endpoint.includes("/sos/cancel")) return { alertId: "sos-1" };
  if (endpoint.includes("/sos/trigger")) return { message: "integration test", latitude: 0, longitude: 0 };
  if (endpoint.includes("/system/sync")) return { scope: { test: true } };
  return {};
}
function queryFor(endpoint) {
  if (endpoint.includes("/control/status") || endpoint.includes("/control/live")) return "?sessionId=session-1";
  return "";
}
(async () => {
  assert.ok(API.length >= 60, "master API catalog must contain at least 60 endpoints");
  const db = seedDb();
  const app = createApp({
    db,
    verifyIdToken: async token => {
      if (token !== "integration-token") throw new Error("invalid token");
      return { uid: "user-1", email: "integration@example.invalid", admin: true, owner: true, role: "OWNER" };
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const results = [];
  const planResponse = await fetch(base + "/api/plans", { headers: { authorization: "Bearer integration-token" } });
  assert.equal(planResponse.status, 200);
  const planPayload = await planResponse.json();
  assert.equal(planPayload.plans[0].durationValue, 1);
  assert.equal(planPayload.plans[0].durationUnit, "MONTHS");
  assert.equal(planPayload.plans[0].linkValidityValue, 10);
  assert.equal(planPayload.plans[0].linkValidityUnit, "MINUTES");

  const linkResponse = await fetch(base + "/api/link/generate", {
    method: "POST",
    headers: { authorization: "Bearer integration-token", "content-type": "application/json" },
    body: JSON.stringify({ planId: "plan-1" })
  });
  assert.equal(linkResponse.status, 201);
  const linkPayload = await linkResponse.json();
  assert.equal(linkPayload.planId, "plan-1");
  assert.ok(Number(linkPayload.expiresAt) > Date.now());
  assert.ok(Number(linkPayload.expiresAt) <= Date.now() + 10 * 60 * 1000 + 2000);

  try {
    for (const route of API) {
      const [method, rawEndpoint] = route.split(" ");
      const endpoint = pathFor(rawEndpoint);
      const url = base + endpoint + queryFor(endpoint);
      const response = await fetch(url, {
        method,
        headers: { authorization: "Bearer integration-token", "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(requestBody(endpoint))
      });
      const body = await response.text();
      const ok = response.status >= 200 && response.status < 300;
      results.push({ route, status: response.status, ok });
      if (!ok) throw new Error(route + " returned HTTP " + response.status + ": " + body.slice(0, 500));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log("Actual HTTP API verification passed: " + results.length + "/" + API.length + " endpoints returned 2xx.");
})();
