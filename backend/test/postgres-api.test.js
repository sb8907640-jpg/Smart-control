const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { installPostgresRoutes } = require("../src/postgres-api");

function mockPool() {
  const calls = [];
  return {
    calls,
    query: async (sql, args) => {
      calls.push({ sql, args });
      if (sql === "SELECT 1") return { rowCount: 1, rows: [] };
      if (sql.includes("INSERT INTO devices")) {
        return { rowCount: 1, rows: [{ id: 1, device_key: "d1", platform: "ANDROID", name: "Phone" }] };
      }
      if (sql.includes("FROM devices")) {
        return { rowCount: 1, rows: [{ id: 1, device_key: "d1", platform: "ANDROID", name: "Phone" }] };
      }
      throw new Error("unexpected query");
    }
  };
}

test("PostgreSQL device API uses parameterized queries and requires authentication", async () => {
  const app = express();
  app.use(express.json());
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== "Bearer valid") {
      return res.status(401).json({ error: "Authentication required." });
    }
    req.user = { uid: "u1" };
    next();
  };
  const pool = mockPool();
  installPostgresRoutes(app, { pool, authenticate });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    let response = await fetch(base + "/api/postgres/status");
    assert.equal(response.status, 200);

    response = await fetch(base + "/api/postgres/devices");
    assert.equal(response.status, 401);

    response = await fetch(base + "/api/postgres/devices", {
      headers: { authorization: "Bearer valid" }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).devices.length, 1);

    response = await fetch(base + "/api/postgres/devices", {
      method: "POST",
      headers: {
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: JSON.stringify({ deviceKey: "d1", platform: "ANDROID", name: "Phone" })
    });
    assert.equal(response.status, 201);
    assert.ok(pool.calls.every(call => !String(call.sql).includes("u1")));
    assert.ok(pool.calls.some(call => call.args?.includes("u1")));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("PostgreSQL group routes forward connection failures to Express error handling", async () => {
  const app = express();
  app.use(express.json());
  const authenticate = (req, _res, next) => {
    req.user = { uid: "u1" };
    next();
  };
  const pool = {
    query: async () => ({ rowCount: 1, rows: [{ ok: 1 }] }),
    connect: async () => { throw new Error("database unavailable"); }
  };
  installPostgresRoutes(app, { pool, authenticate });
  app.use((error, _req, res, _next) => res.status(503).json({ error: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    let response = await fetch(base + "/api/postgres/groups", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ name: "Family" })
    });
    assert.equal(response.status, 503);

    response = await fetch(base + "/api/postgres/groups/join", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ joinCode: "ABCDEFG1234" })
    });
    assert.equal(response.status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
