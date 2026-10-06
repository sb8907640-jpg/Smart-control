const fs = require("node:fs");
const path = require("node:path");
const { API } = require("../../functions/spec/masterCatalog");

const sources = [
  fs.readFileSync(path.join(__dirname, "app.js"), "utf8"),
  fs.readFileSync(path.join(__dirname, "catalog-api.js"), "utf8"),
  fs.readFileSync(path.join(__dirname, "postgres-api.js"), "utf8")
].join("\n");

const missing = API.filter(route => {
  const [method, endpoint] = route.split(" ");
  return !sources.includes(endpoint) || !new RegExp("\\b" + method.toLowerCase() + "\\s*\\(").test(sources);
});

const forbidden = [
  'res.json({ permissions: [] })',
  'res.json({ users: [] })',
  'res.json({ devices: [] })',
  'res.json({ plans: [] })',
  'res.json({ payments: [] })',
  'res.json({ alerts: [] })',
  'res.json({ subscriptions: [] })'
].filter(fragment => sources.includes(fragment));

if (missing.length) throw new Error("Master API routes missing from backend source: " + missing.join(", "));
if (forbidden.length) throw new Error("Dummy endpoint responses remain: " + forbidden.join(", "));
console.log("Backend API source verification passed: " + API.length + " master endpoints declared and no known dummy responses remain.");
