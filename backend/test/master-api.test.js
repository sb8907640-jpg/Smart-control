const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { API } = require("../../functions/spec/masterCatalog");

test("all master API endpoints are declared in backend source and known dummy responses are absent", () => {
  const source = [
    "app.js",
    "catalog-api.js",
    "postgres-api.js"
  ].map(file => fs.readFileSync(path.join(__dirname, "../src", file), "utf8")).join("\n");

  const missing = API.filter(route => {
    const endpoint = route.split(" ")[1];
    return !source.includes(endpoint);
  });
  assert.deepEqual(missing, []);

  for (const fragment of [
    "res.json({ permissions: [] })",
    "res.json({ users: [] })",
    "res.json({ devices: [] })",
    "res.json({ plans: [] })",
    "res.json({ payments: [] })",
    "res.json({ alerts: [] })",
    "res.json({ subscriptions: [] })"
  ]) {
    assert.equal(source.includes(fragment), false, `Dummy endpoint response remains: ${fragment}`);
  }
});
