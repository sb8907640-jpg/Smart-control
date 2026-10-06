const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { API } = require("../../functions/spec/masterCatalog");

test("at least 60 non-auth master API endpoints are declared and dummy responses are absent", () => {
  const source = ["app.js","catalog-api.js","postgres-api.js"]
    .map(file => fs.readFileSync(path.join(__dirname, "../src", file), "utf8")).join("\n");
  const implementedScope = API.filter(route => !route.startsWith("POST /api/auth/"));
  const missing = implementedScope.filter(route => !source.includes(route.split(" ")[1]));
  assert.equal(missing.length, 0, `Missing endpoints: ${missing.join(", ")}`);
  assert.ok(implementedScope.length >= 60, `Only ${implementedScope.length} non-auth master endpoints are in scope`);
  for (const fragment of [
    "res.json({ permissions: [] })","res.json({ users: [] })","res.json({ devices: [] })",
    "res.json({ plans: [] })","res.json({ payments: [] })","res.json({ alerts: [] })",
    "res.json({ subscriptions: [] })"
  ]) assert.equal(source.includes(fragment), false, `Dummy response remains: ${fragment}`);
});
